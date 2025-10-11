/**
 * Example component demonstrating browser SQLite database usage
 */

'use client';

import React, { useState } from 'react';
import { useBrowserDatabase, useTableStore } from './use-browser-database';

// Example: Basic database operations
export function DatabaseExample() {
  const [status, setStatus] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);

  const { 
    isInitialized, 
    isInitializing, 
    error, 
    execute, 
    query, 
    init, 
    isOpfsSupported 
  } = useBrowserDatabase({
    dbName: 'example-db',
    enablePersistence: true,
    initSql: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ],
    autoInit: false
  });

  const handleInit = async () => {
    try {
      setStatus('Initializing database...');
      await init();
      setStatus('Database initialized successfully!');
    } catch (err) {
      setStatus(`Initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddUser = async () => {
    if (!isInitialized) return;

    try {
      const name = `User ${Date.now()}`;
      const email = `user${Date.now()}@example.com`;
      
      const result = await execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [name, email]
      );
      
      setStatus(`User added with ID: ${result.lastInsertRowid}`);
      await loadUsers();
    } catch (err) {
      setStatus(`Failed to add user: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const loadUsers = async () => {
    if (!isInitialized) return;

    try {
      const result = await query('SELECT * FROM users ORDER BY created_at DESC');
      const users = result.values.map(row => ({
        id: row[0],
        name: row[1],
        email: row[2],
        created_at: row[3]
      }));
      setResults(users);
    } catch (err) {
      setStatus(`Failed to load users: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleClearData = async () => {
    if (!isInitialized) return;

    try {
      await execute('DELETE FROM users');
      setResults([]);
      setStatus('All users deleted');
    } catch (err) {
      setStatus(`Failed to clear data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Browser SQLite Example</h2>
      
      <div className="mb-4">
        <p className="mb-2">
          <strong>OPFS Support:</strong> {isOpfsSupported ? '✅ Supported' : '❌ Not Supported'}
        </p>
        <p className="mb-2">
          <strong>Status:</strong> {
            isInitializing ? 'Initializing...' : 
            isInitialized ? 'Ready' : 'Not initialized'
          }
        </p>
        {error && (
          <p className="text-red-600 mb-2">
            <strong>Error:</strong> {error.message}
          </p>
        )}
        {status && (
          <p className="text-blue-600 mb-2">
            <strong>Last Action:</strong> {status}
          </p>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {!isInitialized && (
          <button
            onClick={handleInit}
            disabled={isInitializing}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Initialize Database
          </button>
        )}
        
        {isInitialized && (
          <>
            <button
              onClick={handleAddUser}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Add User
            </button>
            <button
              onClick={loadUsers}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Load Users
            </button>
            <button
              onClick={handleClearData}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Clear Data
            </button>
          </>
        )}
      </div>

      {results.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-2">Users ({results.length}):</h3>
          <div className="space-y-2">
            {results.map((user) => (
              <div key={user.id} className="p-2 bg-gray-100 rounded">
                <div><strong>ID:</strong> {user.id}</div>
                <div><strong>Name:</strong> {user.name}</div>
                <div><strong>Email:</strong> {user.email}</div>
                <div><strong>Created:</strong> {user.created_at}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Example: Table store usage
interface Todo {
  id: number;
  text: string;
  completed: boolean;
  created_at: string;
}

export function TodoStoreExample() {
  const [todoText, setTodoText] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);

  const {
    isInitialized,
    isInitializing,
    error,
    insert,
    findAll,
    update,
    remove
  } = useTableStore<Todo>(
    'todos',
    `CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    { dbName: 'todo-app' }
  );

  const loadTodos = async () => {
    if (!isInitialized) return;
    try {
      const allTodos = await findAll('1=1 ORDER BY created_at DESC');
      setTodos(allTodos);
    } catch (err) {
      console.error('Failed to load todos:', err);
    }
  };

  const addTodo = async () => {
    if (!todoText.trim() || !isInitialized) return;

    try {
      await insert({
        text: todoText.trim(),
        completed: false
      });
      setTodoText('');
      await loadTodos();
    } catch (err) {
      console.error('Failed to add todo:', err);
    }
  };

  const toggleTodo = async (id: number, completed: boolean) => {
    if (!isInitialized) return;

    try {
      await update(id, { completed: !completed });
      await loadTodos();
    } catch (err) {
      console.error('Failed to toggle todo:', err);
    }
  };

  const deleteTodo = async (id: number) => {
    if (!isInitialized) return;

    try {
      await remove(id);
      await loadTodos();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  };

  React.useEffect(() => {
    if (isInitialized) {
      loadTodos();
    }
  }, [isInitialized]);

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Todo Store Example</h2>

      {isInitializing && <p>Initializing database...</p>}
      {error && <p className="text-red-600">Error: {error.message}</p>}

      {isInitialized && (
        <>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              placeholder="Enter todo text..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded"
              onKeyPress={(e) => e.key === 'Enter' && addTodo()}
            />
            <button
              onClick={addTodo}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Add Todo
            </button>
          </div>

          <div className="space-y-2">
            {todos.map((todo) => (
              <div key={todo.id} className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                <input
                  type="checkbox"
                  checked={Boolean(todo.completed)}
                  onChange={() => toggleTodo(todo.id, Boolean(todo.completed))}
                />
                <span className={todo.completed ? 'line-through text-gray-500' : ''}>
                  {todo.text}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="ml-auto px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          {todos.length === 0 && (
            <p className="text-gray-500 text-center py-4">No todos yet. Add one above!</p>
          )}
        </>
      )}
    </div>
  );
}
