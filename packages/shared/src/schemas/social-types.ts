import { z } from 'zod';

export const SocialPlatformSchema = z.enum(['truth_social', 'x_twitter']);
export type SocialPlatform = z.infer<typeof SocialPlatformSchema>;

export const SocialPostSchema = z.object({
  platform: SocialPlatformSchema,
  postId: z.string(),
  author: z.string(),
  content: z.string(),
  publishedAt: z.string(),
  url: z.string(),
  replyCount: z.number().optional(),
  likeCount: z.number().optional(),
  repostCount: z.number().optional(),
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

export const SentimentSchema = z.enum(['bullish', 'bearish', 'neutral']);
export type Sentiment = z.infer<typeof SentimentSchema>;
