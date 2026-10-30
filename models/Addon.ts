import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type AddonStatus = "active" | "inactive";

export type AddonAttributes = {
  id: number;
  tenantId: number;
  name: string;
  description: string | null;
  price: number;
  status: AddonStatus;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type AddonCreationAttributes = Optional<
  AddonAttributes,
  "id" | "description" | "status" | "sortOrder" | "createdAt" | "updatedAt"
>;

export class Addon
  extends Model<AddonAttributes, AddonCreationAttributes>
  implements AddonAttributes
{
  declare id: number;
  declare tenantId: number;
  declare name: string;
  declare description: string | null;
  declare price: number;
  declare status: AddonStatus;
  declare sortOrder: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    Addon.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        tenantId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "tenant_id",
        },
        name: {
          type: DataTypes.STRING(160),
          allowNull: false,
        },
        description: {
          type: DataTypes.STRING(400),
          allowNull: true,
          defaultValue: null,
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM("active", "inactive"),
          allowNull: false,
          defaultValue: "active",
        },
        sortOrder: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 0,
          field: "sort_order",
        },
      },
      {
        sequelize,
        tableName: "addons",
        modelName: "Addon",
      },
    );
  }
}
