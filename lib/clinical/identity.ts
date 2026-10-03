// PostgreSQL UUID identity, including deterministic seeded UUIDs. Version bits
// are not an authorization boundary and must not differ between consumers.
export const isClinicalId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
