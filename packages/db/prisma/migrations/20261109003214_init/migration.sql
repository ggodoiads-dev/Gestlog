-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clients";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clm";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "fleet";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "operations";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "routing";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "workforce";

-- CreateEnum
CREATE TYPE "core"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "core"."TaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_PRESUMIDO', 'LUCRO_REAL');

-- CreateEnum
CREATE TYPE "core"."UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "clients"."ClientStatus" AS ENUM ('ACTIVE', 'PROSPECT', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "clm"."ContractStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SIGNED_PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "routing"."RouteDirection" AS ENUM ('IDA', 'VOLTA', 'ROUND_TRIP');

-- CreateEnum
CREATE TYPE "routing"."RouteStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "workforce"."DriverStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "fleet"."VehicleCategory" AS ENUM ('BUS', 'MINIBUS', 'VAN', 'CAR');

-- CreateEnum
CREATE TYPE "fleet"."VehicleOperationalStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'IN_OPERATION', 'IN_MAINTENANCE', 'BLOCKED', 'INACTIVE', 'ALIENATED');

-- CreateEnum
CREATE TYPE "operations"."ScheduledTripState" AS ENUM ('PLANNED', 'ASSIGNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "operations"."AssignmentState" AS ENUM ('PROPOSED', 'CONVOKED', 'ACCEPTED', 'PRESENTED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "operations"."TripExecutionState" AS ENUM ('NOT_STARTED', 'DRIVER_PRESENTED', 'POSITIONING', 'IN_TRIP', 'ARRIVED', 'COMPLETED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "operations"."OperationalEventType" AS ENUM ('DRIVER_PRESENTED', 'VEHICLE_POSITIONING', 'TRIP_STARTED', 'TRIP_ARRIVED', 'TRIP_COMPLETED', 'RETURNED_TO_GARAGE', 'SHIFT_ENDED', 'INCIDENT_REPORTED');

-- CreateEnum
CREATE TYPE "operations"."EventSource" AS ENUM ('DRIVER_APP', 'SUPERVISOR', 'GPS_DEVICE', 'MANUAL', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "operations"."EventConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "core"."tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "core"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."legal_entities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "trade_name" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_regime" "core"."TaxRegime",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."garages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "garages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "core"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "module_code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "core"."user_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "legal_entity_id" UUID,
    "garage_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "acted_as_user_id" UUID,
    "correlation_id" UUID,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "subject_version" INTEGER,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_name" TEXT NOT NULL,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "cnpj" VARCHAR(14),
    "economic_group" TEXT,
    "status" "clients"."ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."client_units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clm"."contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "legal_entity_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "clm"."ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clm"."contract_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "snapshot_json" JSONB NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing"."routes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "client_unit_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" "routing"."RouteDirection" NOT NULL,
    "status" "routing"."RouteStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing"."route_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "target_arrival_offset_min" INTEGER NOT NULL DEFAULT 10,
    "max_walk_meters" INTEGER NOT NULL DEFAULT 500,
    "capacity_min" INTEGER,
    "snapshot_json" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing"."route_stops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "route_version_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "offset_minutes" INTEGER NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing"."route_turns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "route_version_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "target_arrival_time" VARCHAR(5) NOT NULL,
    "days_of_week" INTEGER[],

    CONSTRAINT "route_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce"."drivers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "phone" TEXT,
    "status" "workforce"."DriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workforce"."driver_licenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "category" VARCHAR(4) NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" DATE NOT NULL,
    "valid_until" DATE NOT NULL,

    CONSTRAINT "driver_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet"."vehicles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "garage_id" UUID,
    "internal_code" TEXT NOT NULL,
    "license_plate" VARCHAR(7) NOT NULL,
    "chassis" VARCHAR(17),
    "renavam" VARCHAR(11),
    "category" "fleet"."VehicleCategory" NOT NULL,
    "seats" INTEGER,
    "model_name" TEXT,
    "model_year" INTEGER,
    "operational_status" "fleet"."VehicleOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet"."vehicle_eligibility_projection" (
    "vehicle_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "is_eligible" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_eligibility_projection_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "fleet"."custodies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custodies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."scheduled_trips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "route_version_id" UUID NOT NULL,
    "route_turn_id" UUID NOT NULL,
    "operational_date" DATE NOT NULL,
    "planned_departure" TIMESTAMP(3) NOT NULL,
    "planned_arrival" TIMESTAMP(3) NOT NULL,
    "state" "operations"."ScheduledTripState" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scheduled_trip_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "state" "operations"."AssignmentState" NOT NULL DEFAULT 'PROPOSED',
    "reason" TEXT,
    "supersedes_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."trip_executions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "scheduled_trip_id" UUID NOT NULL,
    "state" "operations"."TripExecutionState" NOT NULL DEFAULT 'NOT_STARTED',
    "started_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_at" TIMESTAMP(3),
    "validated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."operational_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "trip_execution_id" UUID NOT NULL,
    "type" "operations"."OperationalEventType" NOT NULL,
    "device_timestamp" TIMESTAMP(3),
    "server_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "operations"."EventSource" NOT NULL,
    "confidence" "operations"."EventConfidence" NOT NULL,
    "precision_seconds" INTEGER,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "idempotency_key" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "operational_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core"."idempotency_records" (
    "key" TEXT NOT NULL,
    "tenant_id" UUID,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "core"."tenants"("slug");

-- CreateIndex
CREATE INDEX "legal_entities_tenant_id_idx" ON "core"."legal_entities"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_tenant_id_cnpj_key" ON "core"."legal_entities"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "garages_tenant_id_idx" ON "core"."garages"("tenant_id");

-- CreateIndex
CREATE INDEX "garages_legal_entity_id_idx" ON "core"."garages"("legal_entity_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "core"."users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "core"."users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_code_key" ON "core"."roles"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "core"."permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "core"."user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_legal_entity_id_garage_id_key" ON "core"."user_roles"("user_id", "role_id", "legal_entity_id", "garage_id");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_created_at_idx" ON "audit"."audit_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_subject_type_subject_id_idx" ON "audit"."audit_events"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "core"."documents"("tenant_id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_idx" ON "clients"."clients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_cnpj_key" ON "clients"."clients"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "client_units_tenant_id_idx" ON "clients"."client_units"("tenant_id");

-- CreateIndex
CREATE INDEX "client_units_client_id_idx" ON "clients"."client_units"("client_id");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "clm"."contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "contracts_client_id_idx" ON "clm"."contracts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenant_id_code_key" ON "clm"."contracts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "contract_versions_tenant_id_idx" ON "clm"."contract_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contract_id_version_key" ON "clm"."contract_versions"("contract_id", "version");

-- CreateIndex
CREATE INDEX "routes_tenant_id_idx" ON "routing"."routes"("tenant_id");

-- CreateIndex
CREATE INDEX "routes_contract_id_idx" ON "routing"."routes"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "routes_tenant_id_code_key" ON "routing"."routes"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "route_versions_tenant_id_idx" ON "routing"."route_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_versions_route_id_version_key" ON "routing"."route_versions"("route_id", "version");

-- CreateIndex
CREATE INDEX "route_stops_tenant_id_idx" ON "routing"."route_stops"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_route_version_id_sequence_key" ON "routing"."route_stops"("route_version_id", "sequence");

-- CreateIndex
CREATE INDEX "route_turns_tenant_id_idx" ON "routing"."route_turns"("tenant_id");

-- CreateIndex
CREATE INDEX "drivers_tenant_id_idx" ON "workforce"."drivers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_tenant_id_cpf_key" ON "workforce"."drivers"("tenant_id", "cpf");

-- CreateIndex
CREATE INDEX "driver_licenses_tenant_id_idx" ON "workforce"."driver_licenses"("tenant_id");

-- CreateIndex
CREATE INDEX "driver_licenses_driver_id_idx" ON "workforce"."driver_licenses"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_licenses_tenant_id_number_key" ON "workforce"."driver_licenses"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "vehicles_tenant_id_idx" ON "fleet"."vehicles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_internal_code_key" ON "fleet"."vehicles"("tenant_id", "internal_code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_tenant_id_license_plate_key" ON "fleet"."vehicles"("tenant_id", "license_plate");

-- CreateIndex
CREATE INDEX "vehicle_eligibility_projection_tenant_id_idx" ON "fleet"."vehicle_eligibility_projection"("tenant_id");

-- CreateIndex
CREATE INDEX "custodies_tenant_id_idx" ON "fleet"."custodies"("tenant_id");

-- CreateIndex
CREATE INDEX "custodies_vehicle_id_idx" ON "fleet"."custodies"("vehicle_id");

-- CreateIndex
CREATE INDEX "custodies_driver_id_idx" ON "fleet"."custodies"("driver_id");

-- CreateIndex
CREATE INDEX "scheduled_trips_tenant_id_operational_date_idx" ON "operations"."scheduled_trips"("tenant_id", "operational_date");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_trips_route_version_id_route_turn_id_operational__key" ON "operations"."scheduled_trips"("route_version_id", "route_turn_id", "operational_date");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_scheduled_trip_id_idx" ON "operations"."assignments"("tenant_id", "scheduled_trip_id");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_vehicle_id_idx" ON "operations"."assignments"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_driver_id_idx" ON "operations"."assignments"("tenant_id", "driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "trip_executions_scheduled_trip_id_key" ON "operations"."trip_executions"("scheduled_trip_id");

-- CreateIndex
CREATE INDEX "trip_executions_tenant_id_idx" ON "operations"."trip_executions"("tenant_id");

-- CreateIndex
CREATE INDEX "operational_events_tenant_id_trip_execution_id_idx" ON "operations"."operational_events"("tenant_id", "trip_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "operational_events_tenant_id_idempotency_key_key" ON "operations"."operational_events"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idempotency_records_tenant_id_idx" ON "core"."idempotency_records"("tenant_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "core"."idempotency_records"("expires_at");

-- AddForeignKey
ALTER TABLE "core"."legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."garages" ADD CONSTRAINT "garages_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "core"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "core"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "core"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients"."clients" ADD CONSTRAINT "clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients"."client_units" ADD CONSTRAINT "client_units_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clm"."contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clm"."contracts" ADD CONSTRAINT "contracts_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "core"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clm"."contract_versions" ADD CONSTRAINT "contract_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "clm"."contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."routes" ADD CONSTRAINT "routes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."routes" ADD CONSTRAINT "routes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "clm"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."routes" ADD CONSTRAINT "routes_client_unit_id_fkey" FOREIGN KEY ("client_unit_id") REFERENCES "clients"."client_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_versions" ADD CONSTRAINT "route_versions_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routing"."routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_stops" ADD CONSTRAINT "route_stops_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "routing"."route_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing"."route_turns" ADD CONSTRAINT "route_turns_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "routing"."route_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce"."drivers" ADD CONSTRAINT "drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workforce"."driver_licenses" ADD CONSTRAINT "driver_licenses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "workforce"."drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet"."vehicles" ADD CONSTRAINT "vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet"."vehicles" ADD CONSTRAINT "vehicles_garage_id_fkey" FOREIGN KEY ("garage_id") REFERENCES "core"."garages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet"."vehicle_eligibility_projection" ADD CONSTRAINT "vehicle_eligibility_projection_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "fleet"."vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet"."custodies" ADD CONSTRAINT "custodies_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "fleet"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet"."custodies" ADD CONSTRAINT "custodies_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "workforce"."drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."scheduled_trips" ADD CONSTRAINT "scheduled_trips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."scheduled_trips" ADD CONSTRAINT "scheduled_trips_route_version_id_fkey" FOREIGN KEY ("route_version_id") REFERENCES "routing"."route_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."assignments" ADD CONSTRAINT "assignments_scheduled_trip_id_fkey" FOREIGN KEY ("scheduled_trip_id") REFERENCES "operations"."scheduled_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."assignments" ADD CONSTRAINT "assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "fleet"."vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."assignments" ADD CONSTRAINT "assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "workforce"."drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."assignments" ADD CONSTRAINT "assignments_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "operations"."assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."trip_executions" ADD CONSTRAINT "trip_executions_scheduled_trip_id_fkey" FOREIGN KEY ("scheduled_trip_id") REFERENCES "operations"."scheduled_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."operational_events" ADD CONSTRAINT "operational_events_trip_execution_id_fkey" FOREIGN KEY ("trip_execution_id") REFERENCES "operations"."trip_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
