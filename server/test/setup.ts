// Seguro: los tests nunca deben correr contra la base de producción.
const url = process.env.DATABASE_URL ?? '';
if (url && !/\/[A-Za-z0-9_]+_test(\?|$)/.test(url)) {
  throw new Error('Los tests solo corren contra una base cuyo nombre termina en _test.');
}
