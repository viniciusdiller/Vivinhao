import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type UserRole = "admin" | "staff" | "customer";
export type TeamRole = "Recepcao" | "Limpeza" | "Manutencao" | "Gestao";
export type EmploymentStatus = "active" | "inactive";
export type ShiftStatus = "off" | "on_shift";
export type ShiftLabel = "morning" | "afternoon" | "night";

export type UserAttributes = {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  tenantId: number;
  phone: string | null;
  teamRole: TeamRole;
  employmentStatus: EmploymentStatus;
  shiftStatus: ShiftStatus;
  shiftLabel: ShiftLabel;
  lastPunchAt: Date | null;
  dashboardPermissions: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type UserCreationAttributes = Optional<
  UserAttributes,
  | "id"
  | "name"
  | "role"
  | "phone"
  | "teamRole"
  | "employmentStatus"
  | "shiftStatus"
  | "shiftLabel"
  | "lastPunchAt"
  | "dashboardPermissions"
  | "createdAt"
  | "updatedAt"
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: number;
  declare name: string;
  declare email: string;
  declare passwordHash: string;
  declare role: UserRole;
  declare tenantId: number;
  declare phone: string | null;
  declare teamRole: TeamRole;
  declare employmentStatus: EmploymentStatus;
  declare shiftStatus: ShiftStatus;
  declare shiftLabel: ShiftLabel;
  declare lastPunchAt: Date | null;
  declare dashboardPermissions: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    User.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
          defaultValue: "",
        },
        email: {
          // Unicidade garantida por migracao idempotente (lib/db.ts,
          // ensureUniqueIndexes) — ver comentario equivalente em Room.ts.
          type: DataTypes.STRING(160),
          allowNull: false,
          validate: {
            isEmail: true,
          },
        },
        passwordHash: {
          type: DataTypes.STRING(255),
          allowNull: false,
          field: "password_hash",
        },
        role: {
          type: DataTypes.ENUM("admin", "staff", "customer"),
          allowNull: false,
          defaultValue: "admin",
        },
        tenantId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "tenant_id",
          references: {
            model: "tenants",
            key: "id",
          },
        },
        phone: {
          type: DataTypes.STRING(30),
          allowNull: true,
        },
        teamRole: {
          type: DataTypes.ENUM("Recepcao", "Limpeza", "Manutencao", "Gestao"),
          allowNull: false,
          defaultValue: "Recepcao",
          field: "team_role",
        },
        employmentStatus: {
          type: DataTypes.ENUM("active", "inactive"),
          allowNull: false,
          defaultValue: "active",
          field: "employment_status",
        },
        shiftStatus: {
          type: DataTypes.ENUM("off", "on_shift"),
          allowNull: false,
          defaultValue: "off",
          field: "shift_status",
        },
        shiftLabel: {
          type: DataTypes.ENUM("morning", "afternoon", "night"),
          allowNull: false,
          defaultValue: "morning",
          field: "shift_label",
        },
        lastPunchAt: {
          type: DataTypes.DATE,
          allowNull: true,
          field: "last_punch_at",
        },
        dashboardPermissions: {
          type: DataTypes.TEXT,
          allowNull: false,
          defaultValue: "[]",
          field: "dashboard_permissions",
        },
      },
      {
        sequelize,
        tableName: "users",
        modelName: "User",
      },
    );
  }
}
