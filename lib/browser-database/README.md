# Browser SQLite Database

A TypeScript/React client for running SQLite in the browser using the official SQLite WASM library. Supports both in-memory and persistent storage using the Origin Private File System (OPFS).

## Features

- 🚀 **Fast**: Uses official SQLite WASM for optimal performance
- 💾 **Persistent**: Supports OPFS for data persistence across sessions
- 🔒 **Type-safe**: Full TypeScript support with comprehensive types
- ⚛️ **React-friendly**: Hooks for easy integration with React components
- 🛠 **Transaction support**: Execute multiple queries atomically
- 📦 **Import/Export**: Backup and restore database functionality
- 🎯 **Simple API**: Easy-to-use table store for common operations

## Installation

The SQLite WASM package is already installed:

```bash
pnpm add @sqlite.org/sqlite-wasm
```

## Setup

The required headers for SharedArrayBuffer are already configured in `next.config.ts`.

## Basic Usage

### Using the Hook

```tsx
import { useBrowserDatabase } from '@/lib/browser-database';

function MyComponent() {
  const {
    isInitialized,
    isInitializing,
    error,
    execute,
    query,
    init
  } = useBrowserDatabase({
    dbName: 'my-app-db',
    enablePersistence: true,
    initSql: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE
      )`
    ]
  });

  const addUser = async () => {
    await execute(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      ['John Doe', 'john@example.com']
    );
  };

  const getUsers = async () => {
    const result = await query('SELECT * FROM users');
    return result.values.map(row => ({
      id: row[0],
      name: row[1],
      email: row[2]
    }));
  };

  if (isInitializing) return <div>Loading database...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {isInitialized ? (
        <button onClick={addUser}>Add User</button>
      ) : (
        <button onClick={init}>Initialize Database</button>
      )}
    </div>
  );
}
```

### Using the Direct Client

```tsx
import { createBrowserDatabase } from '@/lib/browser-database';

async function directUsage() {
  const db = createBrowserDatabase({
    dbName: 'my-db',
    enablePersistence: true
  });

  await db.init();

  // Execute SQL
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT,
      price REAL
    )
  `);

  // Insert data
  const result = await db.execute(
    'INSERT INTO products (name, price) VALUES (?, ?)',
    ['Laptop', 999.99]
  );
  console.log('Inserted ID:', result.lastInsertRowid);

  // Query data
  const products = await db.query('SELECT * FROM products');
  console.log('Products:', products.values);

  // Transaction
  await db.transaction([
    { sql: 'INSERT INTO products (name, price) VALUES (?, ?)', params: ['Mouse', 29.99] },
    { sql: 'INSERT INTO products (name, price) VALUES (?, ?)', params: ['Keyboard', 79.99] }
  ]);

  await db.close();
}
```

### Using Table Store (Simplified ORM)

```tsx
import { useTableStore } from '@/lib/browser-database';

interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

function UserManager() {
  const {
    isInitialized,
    insert,
    findAll,
    findById,
    update,
    remove
  } = useTableStore<User>(
    'users',
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  const addUser = async (name: string, email: string) => {
    const id = await insert({ name, email });
    console.log('User created with ID:', id);
  };

  const updateUser = async (id: number, data: Partial<User>) => {
    const changes = await update(id, data);
    console.log('Updated rows:', changes);
  };

  const deleteUser = async (id: number) => {
    const changes = await remove(id);
    console.log('Deleted rows:', changes);
  };

  const loadAllUsers = async () => {
    const users = await findAll();
    return users;
  };

  const loadUsersByDomain = async (domain: string) => {
    const users = await findAll('email LIKE ?', [`%@${domain}`]);
    return users;
  };

  return <div>User management interface...</div>;
}
```

## API Reference

### `useBrowserDatabase(options)`

React hook for database operations.

**Options:**
- `dbName: string` - Database name
- `enablePersistence?: boolean` - Use OPFS for persistence (default: true)
- `initSql?: string[]` - SQL to run on initialization
- `autoInit?: boolean` - Auto-initialize on mount (default: true)

**Returns:**
- `isInitialized: boolean` - Database ready state
- `isInitializing: boolean` - Loading state
- `error: Error | null` - Last error
- `execute(sql, params?)` - Execute SQL without results
- `query(sql, params?)` - Query SQL with results
- `transaction(queries)` - Execute multiple queries atomically
- `exportDb()` - Export database as Uint8Array
- `importDb(data)` - Import database from Uint8Array
- `isOpfsSupported: boolean` - Browser OPFS support

### `useTableStore<T>(tableName, schema, options?)`

Simplified ORM-like interface for table operations.

**Returns:**
- `insert(data): Promise<number>` - Insert record, returns ID
- `update(id, data): Promise<number>` - Update record, returns affected rows
- `remove(id): Promise<number>` - Delete record, returns affected rows
- `findById(id): Promise<T | null>` - Find single record by ID
- `findAll(where?, params?): Promise<T[]>` - Find multiple records
- `count(where?, params?): Promise<number>` - Count records

### `BrowserSQLiteClient`

Direct database client class.

**Methods:**
- `init(): Promise<void>` - Initialize database
- `execute(sql, params?): Promise<ExecResult>` - Execute SQL
- `query(sql, params?): Promise<QueryResult>` - Query SQL
- `transaction(queries): Promise<ExecResult[]>` - Execute transaction
- `export(): Promise<Uint8Array>` - Export database
- `import(data): Promise<void>` - Import database
- `close(): Promise<void>` - Close connection

**Static Methods:**
- `BrowserSQLiteClient.isOpfsSupported(): boolean` - Check OPFS support

## Browser Support

- **OPFS Persistence**: Chrome 86+, Firefox 111+, Safari 15.2+
- **SQLite WASM**: All modern browsers with WebAssembly support
- **SharedArrayBuffer**: Requires secure context (HTTPS) and appropriate headers

## Performance Notes

- OPFS provides near-native SQLite performance
- Data persists across browser sessions
- Worker-based execution prevents main thread blocking
- Automatic transaction optimization for bulk operations

## Examples

See `lib/browser-database/example.tsx` for complete working examples including:
- Basic database operations
- Todo app with table store
- Error handling patterns
- Data persistence demos

## Troubleshooting

### "SharedArrayBuffer is not defined"
- Ensure your app is served over HTTPS
- Check that Cross-Origin headers are properly set in next.config.ts

### "Database not initialized"
- Always call `init()` or set `autoInit: true`
- Check for initialization errors in the `error` state

### OPFS not working
- Verify browser support with `BrowserSQLiteClient.isOpfsSupported()`
- Ensure secure context (HTTPS in production)

### Performance issues
- Use transactions for bulk operations
- Consider pagination for large result sets
- Use appropriate indexes for frequently queried columns
