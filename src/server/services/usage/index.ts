import debug from 'debug';
import dayjs from 'dayjs';
import { and, asc, desc, eq } from 'drizzle-orm';

import { LobeChatDatabase } from '@/database/type';
import { UsageRecordItem, UsageLog } from '@/types/usage/usageRecord';
import { formatDate } from '@/utils/format';
import { genRangeWhere, genWhere } from '@/database/utils/genWhere';
import { messages } from '@/database/schemas';
import { MessageMetadata } from '@/types/message';

const log = debug('lobe-usage:service');

export class UsageRecordService {
    private userId: string;
    private db: LobeChatDatabase;
    constructor(db: LobeChatDatabase, userId: string) {
        this.userId = userId;
        this.db = db;
    }

    /**
     * @description Find usage records by month.
     * @param mo Month
     * @returns UsageRecordItem[]
     */
    findByMonth = async (mo?: string): Promise<UsageRecordItem[]> => {
        // 设置 startAt 和 endAt
        let startAt: string;
        let endAt: string;
        if (mo) {
            // mo 格式: "YYYY-MM"
            startAt = dayjs(mo, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
            endAt = dayjs(mo, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
        } else {
            startAt = dayjs().startOf('month').format('YYYY-MM-DD');
            endAt = dayjs().endOf('month').format('YYYY-MM-DD');
        }

        // TODO: To extend to support other features
        // - Functionality: 
        //  - More type of usage, e.g. image generation, file processing, summary, search engine.
        //  - More dimension for analysis, e.g. relational analysis.
        // - Performance: Computing asynchronously for performance.
        // For now, we only support chat messages for normal users for PoC.

        const spends = await this.db.select({
            id: messages.id,
            model: messages.model,
            provider: messages.provider,
            userId: messages.userId,
            role: messages.role,
            createdAt: messages.createdAt,
            updatedAt: messages.createdAt,
            metadata: messages.metadata,
        })
            .from(messages)
            .where(
                genWhere([
                    eq(messages.userId, this.userId),
                    eq(messages.role, 'assistant'),
                    genRangeWhere([startAt, endAt], messages.createdAt, (date) => date.toDate()),
                ]),
            ).orderBy(desc(messages.createdAt));
        return spends.map((spend) => {
            const metadata = spend.metadata as MessageMetadata;
            return {
                id: spend.id,
                model: spend.model,
                provider: spend.provider,
                userId: spend.userId,
                type: 'chat', // Default to 'chat' for messages
                spend: metadata?.cost || 0, // Messages do not have a direct cost associated
                ttft: metadata?.ttft || 0,
                tps: metadata?.tps || 0,
                totalInputTokens: metadata?.totalInputTokens || 0,
                totalOutputTokens: metadata?.totalOutputTokens || 0,
                totalTokens: (metadata?.totalInputTokens || 0) + (metadata?.totalOutputTokens || 0),
                metadata: spend.metadata,
                createdAt: spend.createdAt,
                updatedAt: spend.createdAt,
            } as UsageRecordItem;
        });
    };

    findAndGroupByDay = async (mo?: string): Promise<UsageLog[]> => {
        // 设置 startAt 和 endAt
        let startAt: string;
        let endAt: string;
        if (mo) {
            // mo 格式: "YYYY-MM"
            startAt = dayjs(mo, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
            endAt = dayjs(mo, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
        } else {
            startAt = dayjs().startOf('month').format('YYYY-MM-DD');
            endAt = dayjs().endOf('month').format('YYYY-MM-DD');
        }
        const spends = await this.findByMonth(mo);
        // Clustering by time
        let usages = new Map<string, { date: Date; logs: UsageRecordItem[] }>();
        spends.forEach((spend) => {
            if (!usages.has(formatDate(spend.createdAt))) {
                usages.set(formatDate(spend.createdAt), { date: spend.createdAt, logs: [spend] });
                return;
            }
            usages.get(formatDate(spend.createdAt))?.logs.push(spend);
        });
        // Calculate usage
        let usageLogs: UsageLog[] = [];
        usages.forEach((spends, date) => {
            const totalSpend = spends.logs.reduce((acc, spend) => acc + spend.spend, 0);
            const totalTokens = spends.logs.reduce((acc, spend) => (spend.totalTokens || 0) + acc, 0);
            const totalRequests = spends.logs.length;
            console.log(
                'date',
                date,
                'totalSpend',
                totalSpend,
                'totalTokens',
                totalTokens,
                'totalRequests',
                totalRequests,
            );
            usageLogs.push({
                date: spends.date.getTime(),
                day: date,
                records: spends.logs,
                totalRequests,
                totalSpend,
                totalTokens, // Store the formatted date as a string
            });
        });
        // Padding to ensure the date range is complete
        const startDate = dayjs(startAt);
        const endDate = dayjs(endAt);
        const paddedUsageLogs: UsageLog[] = [];
        // For every day in the range, check if it exists in usageLogs
        // If exists, use it; if not, create a new log with 0 values
        for (let date = startDate; date.isBefore(endDate); date = date.add(1, 'day')) {
            const log = usageLogs.find((log) => log.day === date.format('YYYY-MM-DD'));
            if (log) {
                paddedUsageLogs.push(log);
            } else {
                paddedUsageLogs.push({
                    date: date.toDate().getTime(),
                    day: date.format('YYYY-MM-DD'),
                    records: [],
                    totalRequests: 0,
                    totalSpend: 0,
                    totalTokens: 0,
                });
            }
        }
        return paddedUsageLogs;
    }
}