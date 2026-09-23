const { MongoClient } = require('mongodb');
const mysql = require('mysql2/promise');
const { Client: PGClient } = require('pg');
const { fakerES: faker } = require('@faker-js/faker');

// Configuración de conexiones desde la VM3 (localhost)
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://admin:mongopassword@localhost:27017/db_envios?authSource=admin';

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'rootpassword',
  database: process.env.MYSQL_DB || 'db_clientes',
  port: 3306
};

const PG_CONFIG = {
  host: process.env.PG_HOST || 'localhost',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgrespassword',
  database: process.env.PG_DB || 'db_vehiculos',
  port: 5432
};

const TOTAL_RECORDS = 20000;
const BATCH_SIZE = 2000;
const estadosEnvio = ['CREADO', 'EN_TRANSITO', 'ENTREGADO', 'CANCELADO'];

async function runSeed() {
  console.log('=== Iniciando Seeding para ms-envios ===');

  // 1. OBTENER DIRECCIONES DE CLIENTES ACTIVOS DESDE MYSQL
  console.log('1/3. Consultando clientes activos desde MySQL...');
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  
  // Consulta adaptada a la relación de Clientes y sus Direcciones
  const [clientesRows] = await mysqlConn.query(`
    SELECT c.id AS clienteId, d.calle, d.distrito, d.ciudad, d.codigo_postal AS codigoPostal, d.referencia
    FROM clientes c
    INNER JOIN direcciones d ON c.id = d.cliente_id
    WHERE c.activo = true
  `);
  await mysqlConn.end();

  if (clientesRows.length === 0) {
    throw new Error('No se encontraron clientes activos con dirección en MySQL.');
  }
  console.log(`✓ Se leyeron ${clientesRows.length} registros de direcciones de clientes activos.`);

  // 2. OBTENER VEHÍCULOS DISPONIBLES Y CONDUCTORES ACTIVOS DESDE POSTGRESQL
  console.log('2/3. Consultando vehículos disponibles y conductores desde PostgreSQL...');
  const pgClient = new PGClient(PG_CONFIG);
  await pgClient.connect();

  const { rows: vehiculosRows } = await pgClient.query(`
    SELECT 
      v.id_vehiculo AS "idVehiculo", v.placa, v.tipo, v.marca, v.modelo,
      c.id_conductor AS "idConductor", c.nombre, c.apellido, c.dni, c.turno
    FROM vehiculos v
    INNER JOIN conductores c ON v.id_vehiculo = c.id_vehiculo
    WHERE v.estado = 'DISPONIBLE' AND c.activo = true
  `);
  await pgClient.end();

  if (vehiculosRows.length === 0) {
    throw new Error('No se encontraron vehículos DISPONIBLES con conductores activos en PostgreSQL.');
  }
  console.log(`✓ Se leyeron ${vehiculosRows.length} combinaciones válidas de (Vehículo + Conductor).`);

  // 3. GENERAR E INSERTAR LOS 20,000 ENVÍOS EN MONGODB
  console.log(`3/3. Conectando a MongoDB para insertar ${TOTAL_RECORDS} envíos...`);
  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db();
  const enviosCollection = db.collection('envios');

  const startTime = Date.now();

  for (let i = 0; i < TOTAL_RECORDS; i += BATCH_SIZE) {
    const batch = [];

    for (let j = 0; j < BATCH_SIZE; j++) {
      const clienteRandom = faker.helpers.arrayElement(clientesRows);
      const vehiculoRandom = faker.helpers.arrayElement(vehiculosRows);

      batch.push({
        codigoSeguimiento: `LOG-${faker.string.alphanumeric({ length: 8, casing: 'upper' })}`,
        clienteId: clienteRandom.clienteId,
        pedidoId: `PED-${faker.number.int({ min: 1000, max: 9999 })}`,
        estado: faker.helpers.arrayElement(estadosEnvio),
        direccionEntrega: {
          calle: clienteRandom.calle,
          distrito: clienteRandom.distrito,
          ciudad: clienteRandom.ciudad || 'Lima',
          codigoPostal: clienteRandom.codigoPostal || '15036',
          referencia: clienteRandom.referencia || 'Sin referencia'
        },
        items: [
          {
            sku: `SKU-${faker.string.numeric(3)}`,
            descripcion: faker.commerce.productName(),
            cantidad: faker.number.int({ min: 1, max: 4 }),
            pesoKg: parseFloat(faker.number.float({ min: 0.5, max: 12, fractionDigits: 1 }))
          }
        ],
        vehiculoAsignado: {
          idVehiculo: vehiculoRandom.idVehiculo,
          placa: vehiculoRandom.placa,
          tipo: vehiculoRandom.tipo,
          marca: vehiculoRandom.marca,
          modelo: vehiculoRandom.modelo
        },
        conductorAsignado: {
          idConductor: vehiculoRandom.idConductor,
          nombre: vehiculoRandom.nombre,
          apellido: vehiculoRandom.apellido,
          dni: vehiculoRandom.dni,
          turno: vehiculoRandom.turno
        },
        fechaCreacion: faker.date.past({ years: 1 }),
        fechaActualizacion: new Date()
      });
    }

    await enviosCollection.insertMany(batch);
    console.log(`    Progress: ${i + BATCH_SIZE} / ${TOTAL_RECORDS} documentos insertados`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n¡Éxito! Carga completada en ${duration} segundos.`);
  await mongoClient.close();
}

runSeed().catch(console.error);
