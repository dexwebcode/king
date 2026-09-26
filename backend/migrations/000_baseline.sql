-- =====================================================================
-- 000_baseline.sql — baseline legacy schema (БЕЗ данных).
--
-- Верифицированный дамп схемы legacy-таблиц (users/orders/transaction/
-- expenses/referals), на которые опираются версионированные миграции
-- 001_*.sql .. 011_*.sql. Получен из рабочей БД командой:
--   pg_dump --schema-only --no-owner --no-privileges --table=...
--
-- Применять ПЕРВЫМ к пустой базе, до 001_yookassa_balance.sql.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS migration_temp;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'users_lang'
          AND typnamespace = 'migration_temp'::regnamespace
    ) THEN
        CREATE TYPE migration_temp.users_lang AS ENUM ('ru', 'en');
    END IF;
END $$;


--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: expenses; Type: TABLE; Schema: migration_temp; Owner: -
--

CREATE TABLE migration_temp.expenses (
    id bigint NOT NULL,
    user_id character varying(99) DEFAULT NULL::character varying,
    order_id character varying(99) DEFAULT NULL::character varying,
    balance_before numeric(10,2) DEFAULT NULL::numeric,
    balance_after numeric(10,2) DEFAULT NULL::numeric,
    amount numeric(10,2) DEFAULT NULL::numeric,
    date character varying(20) DEFAULT NULL::character varying,
    type integer
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: migration_temp; Owner: -
--

CREATE SEQUENCE migration_temp.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: migration_temp; Owner: -
--

ALTER SEQUENCE migration_temp.expenses_id_seq OWNED BY migration_temp.expenses.id;


--
-- Name: orders; Type: TABLE; Schema: migration_temp; Owner: -
--

CREATE TABLE migration_temp.orders (
    id bigint NOT NULL,
    id_rocket bigint DEFAULT '0'::bigint NOT NULL,
    soc character varying(9) DEFAULT NULL::character varying,
    user_id bigint DEFAULT '0'::bigint NOT NULL,
    service_id integer NOT NULL,
    link character varying(999) NOT NULL,
    qnt bigint NOT NULL,
    amount numeric(10,2) NOT NULL,
    before bigint,
    posts bigint DEFAULT '0'::bigint NOT NULL,
    date character varying(99) NOT NULL,
    status character varying(29) NOT NULL,
    remains bigint DEFAULT '0'::bigint NOT NULL,
    api_order integer DEFAULT 0 NOT NULL
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: migration_temp; Owner: -
--

CREATE SEQUENCE migration_temp.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: migration_temp; Owner: -
--

ALTER SEQUENCE migration_temp.orders_id_seq OWNED BY migration_temp.orders.id;


--
-- Name: referals; Type: TABLE; Schema: migration_temp; Owner: -
--

CREATE TABLE migration_temp.referals (
    user_id bigint NOT NULL,
    refer_id integer DEFAULT 0 NOT NULL,
    amount numeric(10,2) DEFAULT 0.00 NOT NULL
);


--
-- Name: transaction; Type: TABLE; Schema: migration_temp; Owner: -
--

CREATE TABLE migration_temp.transaction (
    id bigint NOT NULL,
    user_id character varying(99) NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance numeric(10,2) NOT NULL,
    method character varying(30) NOT NULL,
    date character varying(99) NOT NULL,
    transaction character varying(99) DEFAULT NULL::character varying
);


--
-- Name: transaction_id_seq; Type: SEQUENCE; Schema: migration_temp; Owner: -
--

CREATE SEQUENCE migration_temp.transaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transaction_id_seq; Type: SEQUENCE OWNED BY; Schema: migration_temp; Owner: -
--

ALTER SEQUENCE migration_temp.transaction_id_seq OWNED BY migration_temp.transaction.id;


--
-- Name: users; Type: TABLE; Schema: migration_temp; Owner: -
--

CREATE TABLE migration_temp.users (
    id bigint NOT NULL,
    login character varying(40),
    user_group character varying(20) DEFAULT 'standart'::character varying NOT NULL,
    password text,
    balance numeric(10,2) DEFAULT 0.00 NOT NULL,
    mail character varying(99),
    token character varying(32) DEFAULT NULL::character varying,
    banned integer DEFAULT 0 NOT NULL,
    lang migration_temp.users_lang DEFAULT 'en'::migration_temp.users_lang NOT NULL,
    chat_id character varying(99) DEFAULT NULL::character varying,
    telegram character varying(99) DEFAULT NULL::character varying,
    discount integer DEFAULT 0 NOT NULL,
    email_verified boolean DEFAULT false NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: migration_temp; Owner: -
--

CREATE SEQUENCE migration_temp.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: migration_temp; Owner: -
--

ALTER SEQUENCE migration_temp.users_id_seq OWNED BY migration_temp.users.id;


--
-- Name: expenses id; Type: DEFAULT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.expenses ALTER COLUMN id SET DEFAULT nextval('migration_temp.expenses_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.orders ALTER COLUMN id SET DEFAULT nextval('migration_temp.orders_id_seq'::regclass);


--
-- Name: transaction id; Type: DEFAULT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.transaction ALTER COLUMN id SET DEFAULT nextval('migration_temp.transaction_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.users ALTER COLUMN id SET DEFAULT nextval('migration_temp.users_id_seq'::regclass);


--
-- Name: expenses idx_16922_primary; Type: CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.expenses
    ADD CONSTRAINT idx_16922_primary PRIMARY KEY (id);


--
-- Name: orders idx_16933_primary; Type: CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.orders
    ADD CONSTRAINT idx_16933_primary PRIMARY KEY (id);


--
-- Name: referals idx_16945_primary; Type: CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.referals
    ADD CONSTRAINT idx_16945_primary PRIMARY KEY (user_id);


--
-- Name: transaction idx_16951_primary; Type: CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.transaction
    ADD CONSTRAINT idx_16951_primary PRIMARY KEY (id);


--
-- Name: users idx_16957_primary; Type: CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.users
    ADD CONSTRAINT idx_16957_primary PRIMARY KEY (id);


--
-- Name: idx_16922_order_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16922_order_id ON migration_temp.expenses USING btree (order_id);


--
-- Name: idx_16922_user_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16922_user_id ON migration_temp.expenses USING btree (user_id);


--
-- Name: idx_16933_link; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16933_link ON migration_temp.orders USING btree (link);


--
-- Name: idx_16933_user_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16933_user_id ON migration_temp.orders USING btree (user_id);


--
-- Name: idx_16945_refer_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16945_refer_id ON migration_temp.referals USING btree (refer_id);


--
-- Name: idx_16951_transaction; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16951_transaction ON migration_temp.transaction USING btree (transaction);


--
-- Name: idx_16951_user_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16951_user_id ON migration_temp.transaction USING btree (user_id);


--
-- Name: idx_16957_email; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16957_email ON migration_temp.users USING btree (mail);


--
-- Name: idx_16957_token; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE INDEX idx_16957_token ON migration_temp.users USING btree (token);


--
-- Name: uq_orders_id_rocket; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_orders_id_rocket ON migration_temp.orders USING btree (id_rocket) WHERE (id_rocket <> 0);


--
-- Name: uq_transaction_crystalpay_external_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_transaction_crystalpay_external_id ON migration_temp.transaction USING btree (method, transaction) WHERE (((method)::text = 'crystalpay'::text) AND (transaction IS NOT NULL) AND ((transaction)::text <> ''::text));


--
-- Name: uq_transaction_heleket_external_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_transaction_heleket_external_id ON migration_temp.transaction USING btree (method, transaction) WHERE (((method)::text = 'heleket'::text) AND (transaction IS NOT NULL) AND ((transaction)::text <> ''::text));


--
-- Name: uq_transaction_yookassa_external_id; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_transaction_yookassa_external_id ON migration_temp.transaction USING btree (method, transaction) WHERE (((method)::text = 'yookassa'::text) AND (transaction IS NOT NULL) AND ((transaction)::text <> ''::text));


--
-- Name: uq_users_login_ci; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_users_login_ci ON migration_temp.users USING btree (lower((login)::text));


--
-- Name: uq_users_mail_ci; Type: INDEX; Schema: migration_temp; Owner: -
--

CREATE UNIQUE INDEX uq_users_mail_ci ON migration_temp.users USING btree (lower((mail)::text));


--
-- Name: orders fk_orders_user; Type: FK CONSTRAINT; Schema: migration_temp; Owner: -
--

ALTER TABLE ONLY migration_temp.orders
    ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES migration_temp.users(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


