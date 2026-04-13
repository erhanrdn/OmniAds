import pg from "pg";

const { Pool } = pg;

function normalizeQueryValue(value) {
  return value === undefined ? null : value;
}

function buildParameterizedQuery(strings, values) {
  let text = strings[0] ?? "";
  const params = [];

  for (let index = 0; index < values.length; index += 1) {
    params.push(normalizeQueryValue(values[index]));
    text += `$${index + 1}${strings[index + 1] ?? ""}`;
  }

  return {
    text,
    values: params,
  };
}

export function createSqlClient(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  const query = async (queryText, params = []) => {
    const result = await pool.query(queryText, params.map(normalizeQueryValue));
    return result.rows;
  };

  const sql = Object.assign(
    async (strings, ...values) => {
      const statement = buildParameterizedQuery(strings, values);
      return query(statement.text, statement.values);
    },
    {
      query,
      end: () => pool.end(),
    },
  );

  return sql;
}
