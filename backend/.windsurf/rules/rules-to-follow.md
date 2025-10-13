---
trigger: always_on
---

- When adding new packages, never write into the Cargo.toml file directly. Always use the 'cargo add' command.

- When removing packages, never write into the Cargo.toml file directly. Always use the cargo remove command.

- When updating packages, never write into the Cargo.toml file directly. Always use the cargo update command.

- Never use old (outdated) Rust syntax, always research the latest syntax and use that instead.

- Add comments to complex logic, explaining the "why" behind the code.

- All code should be written in idiomatic Rust.

- At all times you should always follow best practices, and implement the right thing. 

- Always ask questions if you're not sure what to implement.

- Using Turso for my database 

- Using Clerk for my authentication provider

- Always use an ORM when writing SQL code, never write raw SQL code when using the ORM - it should always be written in Rust

- Always remove unused code the Rust complier is pointing out, never leave them. 

- Always fix bugs heads on, not to find work around or suppress them.

- Never write raw SQL code in this codebase, always write it in rust with an ORM

- If you are unsure on what to do about the task given to you, always search the web for documentation 

- Always search the web for best practices, latest Rust syntax, correct way to do things when importing libraries & using them 