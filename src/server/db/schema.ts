import {
  pgTable, uuid, text, timestamp, integer, real, jsonb, index, unique, uniqueIndex, vector,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { TaxonomyTags, SummarySchema, RegistryStages, ConferenceMetadata } from '@/types/content';
import type { CriticScores, CohortRank, JustificationDossier } from '@/types/critic';
import type { TrendSignals, AreaForecastSignals, AreaForecastPrediction } from '@/types/trends';
import type { InterestTag, UserSettings } from '@/types/user';

// ─── content_items ─────────────────────────────────────────────────────────

export const contentItems = pgTable('content_items', {
  id:               uuid('id').defaultRandom().primaryKey(),
  sourceType:       text('source_type').notNull(),
  sourceId:         text('source_id').notNull(),
  sourceUrl:        text('source_url').notNull(),
  title:            text('title').notNull(),
  authors:          jsonb('authors').$type<string[]>(),
  publishedAt:      timestamp('published_at').notNull(),
  harvestedAt:      timestamp('harvested_at').defaultNow(),
  rawText:          text('raw_text'),
  contentHash:      text('content_hash').notNull().unique(),

  taxonomy:         jsonb('taxonomy').$type<TaxonomyTags>(),
  concepts:         jsonb('concepts').$type<string[]>(),
  difficultyLevel:  text('difficulty_level'),

  infographicUrl:   text('infographic_url'),
  summary:          jsonb('summary').$type<SummarySchema>(),
  podcastUrl:       text('podcast_url'),
  podcastDuration:  integer('podcast_duration_sec'),

  criticScores:     jsonb('critic_scores').$type<CriticScores>(),
  cohortRank:       jsonb('cohort_rank').$type<CohortRank>(),
  justification:    jsonb('justification').$type<JustificationDossier>(),

  trendIds:         jsonb('trend_ids').$type<string[]>(),
  conferenceMetadata: jsonb('conference_metadata').$type<ConferenceMetadata>(),

  embedding:        vector('embedding', { dimensions: 768 }),

  processingStatus: text('processing_status').default('harvested'),
  podcastStatus:    text('podcast_status').default('not_requested'),

  citationCount:    integer('citation_count').default(0),
  engagementScore:  real('engagement_score').default(0),
  globalQuality:    real('global_quality').default(0),

  createdAt:        timestamp('created_at').defaultNow(),
  updatedAt:        timestamp('updated_at').defaultNow(),
}, (table) => ({
  statusIdx:     index('content_items_status_idx').on(table.processingStatus),
  sourceTypeIdx: index('content_items_source_type_idx').on(table.sourceType),
  publishedIdx:  index('content_items_published_at_idx').on(table.publishedAt),
}));

// ─── trends ────────────────────────────────────────────────────────────────

export const trends = pgTable('trends', {
  id:               uuid('id').defaultRandom().primaryKey(),
  name:             text('name').notNull(),
  slug:             text('slug').notNull().unique(),
  category:         text('category'),
  description:      text('description'),
  narrative:        text('narrative'),
  status:           text('status').default('emerging'),
  momentumScore:    real('momentum_score').notNull(),
  zScore:           real('z_score').notNull(),
  signals:          jsonb('signals').$type<TrendSignals>(),
  evidenceIds:      jsonb('evidence_ids').$type<string[]>(),
  centroidEmbedding: vector('centroid_embedding', { dimensions: 768 }),
  detectedAt:       timestamp('detected_at').defaultNow(),
  peakedAt:         timestamp('peaked_at'),
  updatedAt:        timestamp('updated_at').defaultNow(),
});

// ─── users ─────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:                  uuid('id').defaultRandom().primaryKey(),
  email:               text('email').notNull().unique(),
  name:                text('name'),
  role:                text('role'),
  freeTextInterests:   jsonb('free_text_interests').$type<string[]>(),
  structuredInterests: jsonb('structured_interests').$type<InterestTag[]>(),
  interestEmbedding:   vector('interest_embedding', { dimensions: 768 }),
  settings:            jsonb('settings').$type<UserSettings>(),
  passwordHash:        text('password_hash'),
  createdAt:           timestamp('created_at').defaultNow(),
});

// ─── feedback ──────────────────────────────────────────────────────────────

export const feedback = pgTable('feedback', {
  id:           uuid('id').defaultRandom().primaryKey(),
  userId:       uuid('user_id').references(() => users.id),
  contentId:    uuid('content_id').references(() => contentItems.id),
  feedbackType: text('feedback_type').notNull(),
  value:        real('value'),
  tags:         jsonb('tags').$type<string[]>(),
  createdAt:    timestamp('created_at').defaultNow(),
});

// ─── engagements ───────────────────────────────────────────────────────────

export const engagements = pgTable('engagements', {
  id:          uuid('id').defaultRandom().primaryKey(),
  userId:      uuid('user_id').references(() => users.id),
  contentId:   uuid('content_id').references(() => contentItems.id),
  eventType:   text('event_type').notNull(),
  durationSec: integer('duration_sec'),
  passLevel:   text('pass_level'),
  createdAt:   timestamp('created_at').defaultNow(),
});

// ─── processing_registry ───────────────────────────────────────────────────

export const processingRegistry = pgTable('processing_registry', {
  id:            uuid('id').defaultRandom().primaryKey(),
  sourceType:    text('source_type').notNull(),
  sourceId:      text('source_id').notNull(),
  contentHash:   text('content_hash').notNull(),
  contentItemId: uuid('content_item_id').references(() => contentItems.id),
  stages:        jsonb('stages').$type<RegistryStages>(),
  firstSeenAt:   timestamp('first_seen_at').defaultNow(),
  lastCheckedAt: timestamp('last_checked_at').defaultNow(),
}, (table) => ({
  uniqueSource: unique('processing_registry_source_unique').on(table.sourceType, table.sourceId),
  hashIdx:      index('processing_registry_hash_idx').on(table.contentHash),
}));

// ─── system_settings ───────────────────────────────────────────────────────

export const systemSettings = pgTable('system_settings', {
  id:        uuid('id').defaultRandom().primaryKey(),
  key:       text('key').notNull().unique(),
  value:     jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id),
});

// ─── sessions ──────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id:        text('id').primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
}, (table) => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
}));

// ─── area_forecasts ────────────────────────────────────────────────────────

export const areaForecasts = pgTable('area_forecasts', {
  id:           uuid('id').defaultRandom().primaryKey(),
  taxonomyArea: text('taxonomy_area').notNull(),
  forecastDate: timestamp('forecast_date').notNull(),
  signals:      jsonb('signals').$type<AreaForecastSignals>().notNull(),
  prediction:   jsonb('prediction').$type<AreaForecastPrediction>().notNull(),
  narrative:    text('narrative').notNull(),
  createdAt:    timestamp('created_at').defaultNow(),
}, (table) => ({
  uniqueAreaDate: uniqueIndex('area_forecasts_area_date_unique').on(
    table.taxonomyArea,
    sql`DATE(${table.forecastDate})`,
  ),
}));
