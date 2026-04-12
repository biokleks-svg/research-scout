CREATE TABLE "area_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"taxonomy_area" text NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"signals" jsonb NOT NULL,
	"prediction" jsonb NOT NULL,
	"narrative" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
