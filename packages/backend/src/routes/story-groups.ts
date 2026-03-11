import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/connection.js';
import {
  getStoryGroup,
  listActiveStoryGroups,
} from '../services/story-group.js';

const ListStoryGroupsQuerySchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['active', 'closed', 'all'],
      default: 'active',
      description: 'Filter by story group status',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 20,
      description: 'Maximum number of story groups to return',
    },
  },
} as const;

const StoryGroupIdParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Story group UUID',
    },
  },
} as const;

interface ListStoryGroupsQuery {
  status?: 'active' | 'closed' | 'all';
  limit?: number;
}

interface StoryGroupParams {
  id: string;
}

export function registerStoryGroupRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  /**
   * GET /api/v1/story-groups
   * List story groups with optional status filter
   */
  server.get('/api/v1/story-groups', {
    schema: {
      querystring: ListStoryGroupsQuerySchema,
    },
  }, async (request) => {
    const query = request.query as ListStoryGroupsQuery;

    const groups = await listActiveStoryGroups(db, {
      status: query.status ?? 'active',
      limit: query.limit ?? 20,
    });

    return { data: groups };
  });

  /**
   * GET /api/v1/story-groups/:id
   * Get story group detail with event timeline
   */
  server.get('/api/v1/story-groups/:id', {
    schema: {
      params: StoryGroupIdParamsSchema,
    },
  }, async (request, reply) => {
    const { id } = request.params as StoryGroupParams;

    const group = await getStoryGroup(db, id);

    if (!group) {
      return reply.status(404).send({ error: 'Story group not found' });
    }

    return group;
  });
}
