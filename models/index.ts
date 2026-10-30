import { Sequelize } from "sequelize";
import { Expense } from "@/models/Expense";
import { Reservation } from "@/models/Reservation";
import { Room } from "@/models/Room";
import { RoomUnitStatus } from "@/models/RoomUnitStatus";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";
import { Coupon } from "@/models/Coupon";
import { PropertyPhoto } from "@/models/PropertyPhoto";
import { Addon } from "@/models/Addon";
import mysql2 from "mysql2";

export function createSequelizeClient() {
  return new Sequelize({
    dialect: "mysql",
    host: process.env.DB_HOST ?? "localhost",
    dialectModule: mysql2,
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME ?? "channel_manager",
    username: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    logging: false,
  });
}

export function initializeModels(sequelize: Sequelize) {
  Tenant.initialize(sequelize);
  User.initialize(sequelize);
  Room.initialize(sequelize);
  RoomUnitStatus.initialize(sequelize);
  Reservation.initialize(sequelize);
  Expense.initialize(sequelize);
  Coupon.initialize(sequelize);
  PropertyPhoto.initialize(sequelize);
  Addon.initialize(sequelize);
  Tenant.hasMany(User, { foreignKey: "tenantId", as: "users" });
  User.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  Tenant.hasMany(Room, { foreignKey: "tenantId", as: "rooms" });
  Room.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  Tenant.hasMany(PropertyPhoto, { foreignKey: "tenantId", as: "photos" });
  PropertyPhoto.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  Tenant.hasMany(Addon, { foreignKey: "tenantId", as: "addons" });
  Addon.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  Tenant.hasMany(Reservation, { foreignKey: "tenantId", as: "reservations" });
  Reservation.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  Tenant.hasMany(Expense, { foreignKey: "tenantId", as: "expenses" });
  Expense.belongsTo(Tenant, { foreignKey: "tenantId", as: "tenant" });

  User.hasMany(Reservation, {
    foreignKey: "createdByUserId",
    as: "createdReservations",
  });
  Reservation.belongsTo(User, { foreignKey: "createdByUserId", as: "creator" });

  User.hasMany(Expense, {
    foreignKey: "createdByUserId",
    as: "registeredExpenses",
  });
  Expense.belongsTo(User, { foreignKey: "createdByUserId", as: "registrar" });

  Room.hasMany(Reservation, {
    foreignKey: "roomId",
    as: "reservations",
  });
  Reservation.associate();

  Room.hasMany(RoomUnitStatus, { foreignKey: "roomId", as: "unitStatuses" });
  RoomUnitStatus.belongsTo(Room, { foreignKey: "roomId", as: "room" });

  return {
    sequelize,
    Tenant,
    User,
    Room,
    RoomUnitStatus,
    Reservation,
    Expense,
    Coupon,
    PropertyPhoto,
    Addon,
  };
}
