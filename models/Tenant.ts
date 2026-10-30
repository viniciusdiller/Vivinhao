import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type TenantPlan = 'basic' | 'pro' | 'premium';
export type TenantStatus = 'active' | 'suspended';

export type TenantAttributes = {
  id: number;
  name: string;
  slug: string | null;
  document: string | null;
  plan: TenantPlan;
  status: TenantStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type TenantCreationAttributes = Optional<TenantAttributes, 'id' | 'slug' | 'document' | 'plan' | 'status' | 'createdAt' | 'updatedAt'>;

export class Tenant extends Model<TenantAttributes, TenantCreationAttributes> implements TenantAttributes {
  declare id: number;
  declare name: string;
  declare slug: string | null;
  declare document: string | null;
  declare plan: TenantPlan;
  declare status: TenantStatus;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    Tenant.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        // Identificador público e estável da pousada (ex.: "viva-mar"), usado
        // pelas rotas públicas para saber qual tenant servir sem depender do
        // id numérico interno nem de "primeiro tenant do banco" como fallback.
        // Unicidade garantida por migracao idempotente (lib/db.ts,
        // ensureUniqueIndexes) — ver comentario equivalente em Room.ts.
        slug: {
          type: DataTypes.STRING(160),
          allowNull: true,
        },
        document: {
          type: DataTypes.STRING(40),
          allowNull: true,
        },
        plan: {
          type: DataTypes.ENUM('basic', 'pro', 'premium'),
          allowNull: false,
          defaultValue: 'basic',
        },
        status: {
          type: DataTypes.ENUM('active', 'suspended'),
          allowNull: false,
          defaultValue: 'active',
        },
      },
      {
        sequelize,
        tableName: 'tenants',
        modelName: 'Tenant',
      },
    );
  }
}
