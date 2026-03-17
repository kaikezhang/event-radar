CREATE TABLE IF NOT EXISTS "ticker_reference" (
	"ticker" varchar(10) PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"sector" varchar(100),
	"industry" varchar(100),
	"exchange" varchar(20),
	"updated_at" timestamp with time zone DEFAULT now()
);
