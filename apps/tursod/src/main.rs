// use axum::{
//     Router,
//     extract::{Path as AxumPath, State},
//     http::{StatusCode, header::Entry},
//     routing::post,
// };
// // use serde::{Deserialize, Serialize};
// use std::collections::hash_map::Entry as HashMapEntry;
// use std::{collections::HashMap, env, path::PathBuf, sync::Arc};
// use tokio::sync::{OnceCell, RwLock};
// use turso::{Connection, Database};
// use uuid::Uuid;
//
// use crate::L
//
// struct OpenedDatabase {
//     database: Database,
//     connections: RwLock<HashMap<Uuid, Arc<Connection>>>,
// }
//
// impl OpenedDatabase {
//     pub fn new(database: Database) -> Self {
//         OpenedDatabase {
//             database,
//             connections: RwLock::new(HashMap::new()),
//         }
//     }
// }
//
// struct DbsState {
//     opened_dbs: RwLock<HashMap<String, Arc<OnceCell<OpenedDatabase>>>>,
//     base_path: PathBuf,
// }
//
// impl DbsState {
//     pub fn new(base_path: PathBuf) -> Self {
//         Self {
//             opened_dbs: RwLock::new(HashMap::new()),
//             base_path,
//         }
//     }
//
//     pub async fn open_conn(
//         &self,
//         db_name: &str,
//         conn_id: &Uuid,
//     ) -> anyhow::Result<Arc<Connection>> {
//         let cell = {
//             let mut map = self.opened_dbs.write().await;
//             Arc::clone(
//                 map.entry(db_name.to_owned())
//                     .or_insert_with(|| Arc::new(OnceCell::new())),
//             )
//         };
//
//         let path = self
//             .base_path
//             .join(format!("{db_name}.db"))
//             .to_string_lossy()
//             .into_owned();
//
//         let opened_db = cell
//             .get_or_try_init(|| async {
//                 let db = turso::Builder::new_local(&path).build().await?;
//
//                 Ok::<OpenedDatabase, anyhow::Error>(OpenedDatabase::new(db))
//             })
//             .await?;
//
//         let conn = {
//             let mut map = opened_db.connections.write().await;
//
//             match map.entry(conn_id.to_owned()) {
//                 HashMapEntry::Occupied(entry) => Arc::clone(entry.get()),
//                 HashMapEntry::Vacant(entry) => {
//                     let conn = Arc::new(opened_db.database.connect()?);
//
//                     Arc::clone(entry.insert(conn))
//                 }
//             }
//         };
//
//         Ok(conn)
//     }
// }
//
// struct HttpHandlers;
//
// impl HttpHandlers {
//     pub fn router(dbs_state: Arc<DbsState>) -> Router {
//         Router::new()
//             .route("/dbs/{db_name}/conn/{id}", post(Self::open_conn))
//             .with_state(dbs_state)
//     }
//
//     async fn open_conn(
//         State(state): State<Arc<DbsState>>,
//         AxumPath((db_name, conn_id)): AxumPath<(String, String)>,
//     ) -> Result<StatusCode, (StatusCode, String)> {
//         let cn_id = uuid::Uuid::parse_str(&conn_id).map_err(|error| {
//             (
//                 StatusCode::BAD_REQUEST,
//                 format!("Failed to parse id: {error}"),
//             )
//         })?;
//
//         state.open_conn(&db_name, &cn_id).await.map_err(|error| {
//             (
//                 StatusCode::INTERNAL_SERVER_ERROR,
//                 format!("Failed to open database: {error}"),
//             )
//         })?;
//
//         Ok(StatusCode::NO_CONTENT)
//     }
// }

use std::{cell::RefCell, rc::Rc};

async fn dependency() {
    let value = Rc::new(RefCell::new(42));
    println!("{}", value.borrow());
    // tokio::task::yield_now().await;
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tokio::spawn(async {
        dependency().await;

        tokio::task::yield_now().await;

        // *value.borrow_mut() += 1;
    });

    tursod::run().await
}

// async fn open_conn() {}
//
// // basic handler that responds with a static string
// async fn root() -> &'static str {
//     "Hello, World!"
// }
//
// async fn create_user(
//     // this argument tells axum to parse the request body
//     // as JSON into a `CreateUser` type
//     Json(payload): Json<CreateUser>,
// ) -> (StatusCode, Json<User>) {
//     // insert your application logic here
//     let user = User {
//         id: 1337,
//         username: payload.username,
//     };
//
//     // this will be converted into a JSON response
//     // with a status code of `201 Created`
//     (StatusCode::CREATED, Json(user))
// }
//
// // the input to our `create_user` handler
// #[derive(Deserialize)]
// struct CreateUser {
//     username: String,
// }
//
// // the output to our `create_user` handler
// #[derive(Serialize)]
// struct User {
//     id: u64,
//     username: String,
// }
