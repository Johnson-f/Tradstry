pub mod user;
pub mod options;
pub mod stocks;
pub mod trade_notes;
pub mod images;

pub use user::configure_user_routes;
pub use options::configure_options_routes;
pub use stocks::configure_stocks_routes;
pub use trade_notes::configure_trade_notes_routes;
pub use images::configure_images_routes;
