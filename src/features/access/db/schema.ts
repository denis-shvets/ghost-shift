import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";

import { organizations } from "~/features/organizations/db/schema";
import { stores } from "~/features/stores/db/schema";

// Roles are named sets of permissions. A role's scope says where it may be granted:
// `global` (whole app), `organization` (one merchant company) or `store` (one store).
export const roles = pgTable(
  "roles",
  {
    name: text().primaryKey(),
    scope: text().notNull(),
    description: text().notNull(),
  },
  (table) => [
    check("roles_scope_check", sql`${table.scope} in ('global', 'organization', 'store')`),
    // Lets each membership table point at a role of the right scope, and nothing else.
    unique("roles_name_scope_unique").on(table.name, table.scope),
  ],
).enableRLS();

// Permissions are named actions, for example orders.edit.
export const permissions = pgTable("permissions", {
  name: text().primaryKey(),
  description: text().notNull(),
}).enableRLS();

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: text().notNull(),
    permission: text().notNull(),
  },
  (table) => [
    primaryKey({ name: "role_permissions_pk", columns: [table.role, table.permission] }),
    foreignKey({
      name: "role_permissions_role_fk",
      columns: [table.role],
      foreignColumns: [roles.name],
    }).onDelete("cascade"),
    foreignKey({
      name: "role_permissions_permission_fk",
      columns: [table.permission],
      foreignColumns: [permissions.name],
    }).onDelete("cascade"),
  ],
).enableRLS();

// Global roles, such as developer.
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid().notNull(),
    roleScope: text().notNull().default("global"),
    role: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "user_roles_pk", columns: [table.userId, table.role] }),
    foreignKey({
      name: "user_roles_user_fk",
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_roles_role_fk",
      columns: [table.role, table.roleScope],
      foreignColumns: [roles.name, roles.scope],
    }),
    check("user_roles_scope_check", sql`${table.roleScope} = 'global'`),
  ],
).enableRLS();

// A person's roles in one organization. A person may hold several roles there; their
// permissions are the union of all of them.
export const orgMembers = pgTable(
  "org_members",
  {
    userId: uuid().notNull(),
    organizationId: uuid().notNull(),
    roleScope: text().notNull().default("organization"),
    role: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "org_members_pk",
      columns: [table.userId, table.organizationId, table.role],
    }),
    foreignKey({
      name: "org_members_user_fk",
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "org_members_organization_fk",
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "org_members_role_fk",
      columns: [table.role, table.roleScope],
      foreignColumns: [roles.name, roles.scope],
    }),
    check("org_members_scope_check", sql`${table.roleScope} = 'organization'`),
  ],
).enableRLS();

// A person's roles on one store. An agent may hold several roles there, for example
// first-line and second-line support.
export const storeAssignments = pgTable(
  "store_assignments",
  {
    userId: uuid().notNull(),
    storeId: uuid().notNull(),
    roleScope: text().notNull().default("store"),
    role: text().notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "store_assignments_pk",
      columns: [table.userId, table.storeId, table.role],
    }),
    foreignKey({
      name: "store_assignments_user_fk",
      columns: [table.userId],
      foreignColumns: [authUsers.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "store_assignments_store_fk",
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "store_assignments_role_fk",
      columns: [table.role, table.roleScope],
      foreignColumns: [roles.name, roles.scope],
    }),
    check("store_assignments_scope_check", sql`${table.roleScope} = 'store'`),
  ],
).enableRLS();
