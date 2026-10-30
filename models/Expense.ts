import { DataTypes, Model, Optional, Sequelize } from "sequelize";

export type ExpenseCategory =
  | "limpeza"
  | "manutenção"
  | "impostos"
  | "insumos"
  | "comissões"
  | "outros";

export type ExpenseAttributes = {
  id: number;
  createdByUserId: number;
  description: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  tenantId: number;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ExpenseCreationAttributes = Optional<
  ExpenseAttributes,
  "id" | "createdAt" | "updatedAt"
>;

export class Expense
  extends Model<ExpenseAttributes, ExpenseCreationAttributes>
  implements ExpenseAttributes
{
  declare id: number;
  declare createdByUserId: number;
  declare description: string;
  declare amount: number;
  declare date: string;
  declare category: ExpenseCategory;
  declare tenantId: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initialize(sequelize: Sequelize) {
    Expense.init(
      {
        id: {
          type: DataTypes.INTEGER.UNSIGNED,
          autoIncrement: true,
          primaryKey: true,
        },
        createdByUserId: {
          type: DataTypes.INTEGER.UNSIGNED,
          allowNull: false,
          field: "created_by_user_id",
          references: {
            model: "users",
            key: "id",
          },
        },
        description: {
          type: DataTypes.STRING(200),
          allowNull: false,
        },
        amount: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
        },
        date: {
          type: DataTypes.DATEONLY,
          allowNull: false,
        },
        category: {
          type: DataTypes.ENUM(
            "limpeza",
            "manutenção",
            "impostos",
            "insumos",
            "comissões",
            "outros",
          ),
          allowNull: false,
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
        tableName: "expenses",
        modelName: "Expense",
      },
    );
  }
}
