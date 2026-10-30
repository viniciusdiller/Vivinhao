import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type PropertyPhotoAttributes = {
  id: number;
  tenantId: number;
  url: string;
  caption?: string | null;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type PropertyPhotoCreationAttributes = Optional<
  PropertyPhotoAttributes,
  "id" | "caption" | "sortOrder" | "createdAt" | "updatedAt"
>;

export class PropertyPhoto
  extends Model<PropertyPhotoAttributes, PropertyPhotoCreationAttributes>
  implements PropertyPhotoAttributes
{
  declare id: number;
  declare tenantId: number;
  declare url: string;
  declare caption: string | null;
  declare sortOrder: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    PropertyPhoto.init(
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
          references: {
            model: "tenants",
            key: "id",
          },
        },
        url: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        caption: {
          type: DataTypes.STRING(160),
          allowNull: true,
          defaultValue: null,
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
        tableName: "property_photos",
        modelName: "PropertyPhoto",
      },
    );
  }
}
