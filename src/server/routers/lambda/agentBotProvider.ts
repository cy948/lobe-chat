import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { z } from 'zod';

import { AgentBotProviderModel } from '@/database/models/agentBotProvider';
import { authedProcedure, router } from '@/libs/trpc/lambda';
import { serverDatabase } from '@/libs/trpc/lambda/middleware';
import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';
import { GatewayService } from '@/server/services/gateway';

const log = debug('lobe-server:bot-provider');

const agentBotProviderProcedure = authedProcedure.use(serverDatabase).use(async (opts) => {
  const { ctx } = opts;
  const gateKeeper = await KeyVaultsGateKeeper.initWithEnvKey();

  return opts.next({
    ctx: {
      agentBotProviderModel: new AgentBotProviderModel(ctx.serverDB, ctx.userId, gateKeeper),
    },
  });
});

export const agentBotProviderRouter = router({
  create: agentBotProviderProcedure
    .input(
      z.object({
        agentId: z.string(),
        applicationId: z.string(),
        credentials: z.record(z.string()),
        enabled: z.boolean().optional(),
        platform: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      log(
        'create provider userId=%s agentId=%s platform=%s appId=%s enabled=%s',
        ctx.userId,
        input.agentId,
        input.platform,
        input.applicationId,
        input.enabled ?? true,
      );
      try {
        const result = await ctx.agentBotProviderModel.create(input);
        log(
          'create provider success id=%s platform=%s appId=%s',
          result.id,
          result.platform,
          result.applicationId,
        );
        return result;
      } catch (e: any) {
        log('create provider failed: %O', e);
        if (e?.cause?.code === '23505') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `A bot with application ID "${input.applicationId}" is already registered on ${input.platform}. Each application ID can only be used once.`,
          });
        }
        throw e;
      }
    }),

  delete: agentBotProviderProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.agentBotProviderModel.delete(input.id);
    }),

  getByAgentId: agentBotProviderProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ input, ctx }) => {
      const list = await ctx.agentBotProviderModel.findByAgentId(input.agentId);
      log('getByAgentId userId=%s agentId=%s count=%d', ctx.userId, input.agentId, list.length);
      return list;
    }),

  connectBot: agentBotProviderProcedure
    .input(z.object({ applicationId: z.string(), platform: z.string() }))
    .mutation(async ({ input, ctx }) => {
      log(
        'connectBot userId=%s platform=%s appId=%s',
        ctx.userId,
        input.platform,
        input.applicationId,
      );
      const service = new GatewayService();
      const status = await service.startBot(input.platform, input.applicationId, ctx.userId);
      log(
        'connectBot result userId=%s platform=%s appId=%s status=%s',
        ctx.userId,
        input.platform,
        input.applicationId,
        status,
      );

      return { status };
    }),

  update: agentBotProviderProcedure
    .input(
      z.object({
        applicationId: z.string().optional(),
        credentials: z.record(z.string()).optional(),
        enabled: z.boolean().optional(),
        id: z.string(),
        platform: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...value } = input;
      log('update provider userId=%s id=%s value=%O', ctx.userId, id, value);
      const result = await ctx.agentBotProviderModel.update(id, value);
      log('update provider success userId=%s id=%s', ctx.userId, id);
      return result;
    }),
});
