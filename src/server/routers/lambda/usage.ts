import { z } from 'zod';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { UsageRecordService } from '@/server/services/usage';

const usageProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
    const { ctx } = opts
    return opts.next({
        ctx: {
            usageRecordService: new UsageRecordService(ctx.serverDB, ctx.userId),
        },
    });
});

export const usageRouter = router({
    findByMonth: usageProcedure.input(z.object({
        mo: z.string().optional(),
    })).query(async ({ ctx, input }) => {
        return await ctx.usageRecordService.findByMonth(input.mo);
    }),

    findAndGroupByDay: usageProcedure.input(z.object({
        mo: z.string().optional(),
    })).query(async ({ ctx, input }) => {
        return await ctx.usageRecordService.findAndGroupByDay(input.mo);
    }),
})