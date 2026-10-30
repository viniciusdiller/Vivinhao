import { initializeModels, createSequelizeClient } from '@/models';
import { DataTypes } from 'sequelize';
import { generateUniqueTenantSlug } from '@/lib/tenant-slug';

export type DbModels = ReturnType<typeof initializeModels>;

declare global {
  // eslint-disable-next-line no-var
  var __sequelizeModels: DbModels | undefined;
  // eslint-disable-next-line no-var
  var __sequelizeModelsPromise: Promise<DbModels> | undefined;
}

function shouldAutoSyncSchema() {
  const envValue = process.env.DB_AUTO_SYNC;
  if (typeof envValue === 'string') {
    return envValue === 'true';
  }

  return process.env.NODE_ENV !== 'production';
}

async function ensureRoomAmenitiesColumn(models: DbModels) {
  const table = await models.sequelize.getQueryInterface().describeTable('rooms');

  if (!table.amenities) {
    await models.sequelize.getQueryInterface().addColumn('rooms', 'amenities', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'JSON array de comodidades',
    });
  }

  if (!table.photo_urls) {
    await models.sequelize.getQueryInterface().addColumn('rooms', 'photo_urls', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'JSON array de URLs das fotos',
    });
  }

  if (!table.beds) {
    await models.sequelize.getQueryInterface().addColumn('rooms', 'beds', {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
      comment: 'JSON array de camas: [{ type, quantity }]',
    });
  }
}

async function ensureReservationUnitNumberColumn(models: DbModels) {
  const table = await models.sequelize.getQueryInterface().describeTable('reservations');

  if (!table.unit_number) {
    await models.sequelize.getQueryInterface().addColumn('reservations', 'unit_number', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      defaultValue: null,
      comment: 'Número da unidade física (1..quantity) ocupada pela reserva',
    });
  }
}

async function ensureReservationStayColumns(models: DbModels) {
  const queryInterface = models.sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('reservations');

  if (!table.checked_in_at) {
    await queryInterface.addColumn('reservations', 'checked_in_at', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!table.checked_out_at) {
    await queryInterface.addColumn('reservations', 'checked_out_at', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
  }
}

async function ensureTenantSlugColumn(models: DbModels) {
  const queryInterface = models.sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('tenants');

  if (!table.slug) {
    await queryInterface.addColumn('tenants', 'slug', {
      type: DataTypes.STRING(160),
      allowNull: true,
      unique: true,
    });
  }

  // Preenche o slug de tenants antigos (criados antes desta coluna existir)
  // a partir do nome, para que as rotas públicas possam identificá-los sem
  // depender do id numérico interno.
  const tenantsWithoutSlug = await models.Tenant.findAll({ where: { slug: null } });

  for (const tenant of tenantsWithoutSlug) {
    const slug = await generateUniqueTenantSlug(tenant.name, async (candidate) => {
      const existing = await models.Tenant.findOne({ where: { slug: candidate } });
      return Boolean(existing);
    });

    await tenant.update({ slug });
  }
}

async function ensureUserTeamColumns(models: DbModels) {
  const queryInterface = models.sequelize.getQueryInterface();
  const table = await queryInterface.describeTable('users');

  if (!table.name) {
    await queryInterface.addColumn('users', 'name', {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: '',
    });
  }

  if (!table.phone) {
    await queryInterface.addColumn('users', 'phone', {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!table.team_role) {
    await queryInterface.addColumn('users', 'team_role', {
      type: DataTypes.ENUM('Recepcao', 'Limpeza', 'Manutencao', 'Gestao'),
      allowNull: false,
      defaultValue: 'Recepcao',
    });
  }

  if (!table.employment_status) {
    await queryInterface.addColumn('users', 'employment_status', {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
    });
  }

  if (!table.shift_status) {
    await queryInterface.addColumn('users', 'shift_status', {
      type: DataTypes.ENUM('off', 'on_shift'),
      allowNull: false,
      defaultValue: 'off',
    });
  }

  if (!table.shift_label) {
    await queryInterface.addColumn('users', 'shift_label', {
      type: DataTypes.ENUM('morning', 'afternoon', 'night'),
      allowNull: false,
      defaultValue: 'morning',
    });
  }

  if (!table.last_punch_at) {
    await queryInterface.addColumn('users', 'last_punch_at', {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
  }

  if (!table.dashboard_permissions) {
    await queryInterface.addColumn('users', 'dashboard_permissions', {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
    });
  }
}

// Cria os índices únicos "na mão", checando antes se já existem — nunca
// via `unique: true` no atributo do model. Com `unique: true`, o
// sync({alter:true}) recria o índice a cada cold start sem remover o
// anterior (bug conhecido do Sequelize com MySQL), e como o sync roda em
// todo restart fora de produção, isso já estourou o limite de 64 chaves
// por tabela do MySQL (tabela `rooms`) depois de dezenas de restarts.
async function ensureUniqueIndexes(models: DbModels) {
  const queryInterface = models.sequelize.getQueryInterface();

  const targets: Array<{ table: string; column: string; indexName: string }> = [
    { table: 'rooms', column: 'local_room_id', indexName: 'local_room_id' },
    { table: 'rooms', column: 'channex_room_type_id', indexName: 'channex_room_type_id' },
    { table: 'users', column: 'email', indexName: 'email' },
    { table: 'reservations', column: 'channex_reservation_id', indexName: 'channex_reservation_id' },
    { table: 'tenants', column: 'slug', indexName: 'slug' },
  ];

  for (const target of targets) {
    const existingIndexes = await queryInterface.showIndex(target.table) as Array<{ name: string }>;
    const alreadyExists = existingIndexes.some((index) => index.name === target.indexName);

    if (!alreadyExists) {
      await queryInterface.addIndex(target.table, [target.column], {
        name: target.indexName,
        unique: true,
      });
    }
  }
}

export async function getDb(): Promise<DbModels> {
  if (!global.__sequelizeModelsPromise) {
    global.__sequelizeModelsPromise = (async () => {
      if (!global.__sequelizeModels) {
        const sequelize = createSequelizeClient();
        global.__sequelizeModels = initializeModels(sequelize);

        await sequelize.authenticate();
        if (shouldAutoSyncSchema()) {
          await sequelize.sync({ alter: true });
        }
        // Migrações incrementais só precisam rodar uma vez, no cold start —
        // repeti-las a cada requisição soma um describeTable() por chamada.
        await ensureRoomAmenitiesColumn(global.__sequelizeModels);
        await ensureUserTeamColumns(global.__sequelizeModels);
        await ensureReservationUnitNumberColumn(global.__sequelizeModels);
        await ensureReservationStayColumns(global.__sequelizeModels);
        await ensureTenantSlugColumn(global.__sequelizeModels);
        await ensureUniqueIndexes(global.__sequelizeModels);
      }

      return global.__sequelizeModels;
    })().catch((error) => {
      global.__sequelizeModels = undefined;
      global.__sequelizeModelsPromise = undefined;
      throw error;
    });
  }

  return global.__sequelizeModelsPromise;
}
