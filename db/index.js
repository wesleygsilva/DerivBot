const { Pool } = require('pg');
const dbConfig = require('../config/db.config.js');

// Create a new connection pool
const pool = new Pool(dbConfig);

pool.on('connect', () => {
    console.log('Conectado ao banco de dados PostgreSQL!');
});

pool.on('error', (err) => {
    console.error('Erro inesperado no cliente do pool de banco de dados', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
