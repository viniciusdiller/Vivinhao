import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type RoomAttributes = {
  id: number;
  localRoomId: string;
  channexRoomTypeId: string;
  name: string;
  price: number;
  minStayNights?: number | null;
  minStayDays?: number | null;
  seasonalRates?: string | null;
  minimumStayPeriods?: string | null;
  closurePeriods?: string | null;
  quantity: number;
  maxGuests: number;
  status: "active" | "maintenance";
  amenities?: string | null;
  photoUrls?: string | null;
  beds?: string | null;
  tenantId: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type RoomCreationAttributes = Optional<
  RoomAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class Room
  extends Model<RoomAttributes, RoomCreationAttributes>
  implements RoomAttributes
{
  declare id: number;
  declare localRoomId: string;
  declare channexRoomTypeId: string;
  declare name: string;
  declare price: number;
  declare minStayNights: number | null;
  declare minStayDays: number | null;
  declare seasonalRates: string | null;
  declare minimumStayPeriods: string | null;
  declare closurePeriods: string | null;
  declare quantity: number;
  declare maxGuests: number;
  declare status: "active" | "maintenance";
  declare amenities: string | null;
  declare photoUrls: string | null;
  declare beds: string | null;
  declare tenantId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    Room.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        localRoomId: {
          // O unico e garantido por uma migracao idempotente em lib/db.ts
          // (ensureUniqueIndexes), nao por "unique: true" aqui — o
          // sync({alter:true}) recria esse indice a cada cold start sem
          // remover o anterior, e o MySQL tem limite de 64 chaves por
          // tabela (ja estourou uma vez nesta tabela).
          type: DataTypes.STRING(60),
          allowNull: false,
          field: "local_room_id",
        },
        channexRoomTypeId: {
          type: DataTypes.STRING(80),
          allowNull: false,
          field: "channex_room_type_id",
        },
        name: {
          type: DataTypes.STRING(120),
          allowNull: false,
        },
        price: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        minStayNights: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: null,
          field: "min_stay_nights",
        },
        minStayDays: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: true,
          defaultValue: null,
          field: "min_stay_days",
        },
        seasonalRates: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          field: "seasonal_rates",
          comment: "JSON array com períodos e preços sazonais",
        },
        minimumStayPeriods: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          field: "minimum_stay_periods",
          comment: "JSON array com períodos e estadia mínima (independente do preço)",
        },
        closurePeriods: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          field: "closure_periods",
          comment: "JSON array com períodos de bloqueio/fechamento",
        },
        quantity: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 1,
        },
        maxGuests: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          defaultValue: 2,
          field: "max_guests",
        },
        status: {
          type: DataTypes.ENUM("active", "maintenance"),
          allowNull: false,
          defaultValue: "active",
        },
        amenities: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          comment: "JSON array de comodidades",
        },
        photoUrls: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          field: "photo_urls",
          comment: "JSON array de URLs das fotos",
        },
        beds: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
          comment: "JSON array de camas: [{ type, quantity }]",
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
      },
      {
        sequelize,
        tableName: "rooms",
        modelName: "Room",
      },
    );
  }
}
