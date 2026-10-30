import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type RoomUnitOperationalStatus =
  | "vacant"
  | "cleaning"
  | "awaiting_guest"
  | "maintenance"
  | "occupied";

export type RoomUnitStatusAttributes = {
  id: number;
  roomId: number;
  unitNumber: number;
  tenantId: number;
  status: RoomUnitOperationalStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

export type RoomUnitStatusCreationAttributes = Optional<
  RoomUnitStatusAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class RoomUnitStatus
  extends Model<RoomUnitStatusAttributes, RoomUnitStatusCreationAttributes>
  implements RoomUnitStatusAttributes
{
  declare id: number;
  declare roomId: number;
  declare unitNumber: number;
  declare tenantId: number;
  declare status: RoomUnitOperationalStatus;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    RoomUnitStatus.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        roomId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "room_id",
        },
        unitNumber: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "unit_number",
        },
        tenantId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "tenant_id",
        },
        status: {
          type: DataTypes.ENUM(
            "vacant",
            "cleaning",
            "awaiting_guest",
            "maintenance",
            "occupied"
          ),
          allowNull: false,
          defaultValue: "vacant",
        },
      },
      {
        sequelize,
        tableName: "room_unit_statuses",
        indexes: [
          {
            unique: true,
            fields: ["room_id", "unit_number"],
          },
        ],
      }
    );
  }
}
