use std::marker::PhantomData;

use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, DbErr, ExecResult,
    QueryResult, Statement, TryGetable, Value,
};

#[async_trait::async_trait]
pub trait RawConnection: Send + Sync {
    async fn raw_execute(&self, statement: Statement) -> Result<ExecResult, DbErr>;
    async fn raw_query_all(&self, statement: Statement) -> Result<Vec<QueryResult>, DbErr>;
    async fn raw_query_one(&self, statement: Statement) -> Result<Option<QueryResult>, DbErr>;
}

macro_rules! impl_raw_connection {
    ($type:ty) => {
        #[async_trait::async_trait]
        impl RawConnection for $type {
            async fn raw_execute(&self, statement: Statement) -> Result<ExecResult, DbErr> {
                self.execute_raw(statement).await
            }

            async fn raw_query_all(&self, statement: Statement) -> Result<Vec<QueryResult>, DbErr> {
                self.query_all_raw(statement).await
            }

            async fn raw_query_one(
                &self,
                statement: Statement,
            ) -> Result<Option<QueryResult>, DbErr> {
                self.query_one_raw(statement).await
            }
        }
    };
}

impl_raw_connection!(DatabaseConnection);
impl_raw_connection!(DatabaseTransaction);

#[async_trait::async_trait]
impl RawConnection for &mut DatabaseTransaction {
    async fn raw_execute(&self, statement: Statement) -> Result<ExecResult, DbErr> {
        (**self).execute_raw(statement).await
    }

    async fn raw_query_all(&self, statement: Statement) -> Result<Vec<QueryResult>, DbErr> {
        (**self).query_all_raw(statement).await
    }

    async fn raw_query_one(&self, statement: Statement) -> Result<Option<QueryResult>, DbErr> {
        (**self).query_one_raw(statement).await
    }
}

pub type PgConnection = DatabaseTransaction;
pub type PgPool = DatabaseConnection;

pub struct PgRow(QueryResult);

impl PgRow {
    pub fn try_get<T, I>(&self, index: I) -> Result<T, DbErr>
    where
        T: TryGetable,
        I: ColumnIndex,
    {
        index.read(&self.0)
    }
}

pub struct AssertSqlSafe(pub String);

impl From<AssertSqlSafe> for String {
    fn from(value: AssertSqlSafe) -> Self {
        value.0
    }
}

pub trait ColumnIndex {
    fn read<T: TryGetable>(self, row: &QueryResult) -> Result<T, DbErr>;
}

impl ColumnIndex for usize {
    fn read<T: TryGetable>(self, row: &QueryResult) -> Result<T, DbErr> {
        row.try_get_by_index(self)
    }
}

impl ColumnIndex for &str {
    fn read<T: TryGetable>(self, row: &QueryResult) -> Result<T, DbErr> {
        row.try_get("", self)
    }
}

impl ColumnIndex for String {
    fn read<T: TryGetable>(self, row: &QueryResult) -> Result<T, DbErr> {
        row.try_get("", self.as_str())
    }
}

pub trait Row {}

impl Row for PgRow {}

pub struct Query {
    sql: String,
    values: Vec<Value>,
}

pub fn query(sql: impl Into<String>) -> Query {
    Query {
        sql: sql.into(),
        values: Vec::new(),
    }
}

impl Query {
    pub fn bind<T>(mut self, value: T) -> Self
    where
        T: Into<Value>,
    {
        self.values.push(value.into());
        self
    }

    pub async fn execute<C>(self, db: &C) -> Result<ExecResult, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        db.raw_execute(self.statement()).await
    }

    pub async fn fetch_all<C>(self, db: &C) -> Result<Vec<PgRow>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        Ok(db
            .raw_query_all(self.statement())
            .await?
            .into_iter()
            .map(PgRow)
            .collect())
    }

    pub async fn fetch_optional<C>(self, db: &C) -> Result<Option<PgRow>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        Ok(db.raw_query_one(self.statement()).await?.map(PgRow))
    }

    pub async fn fetch_one<C>(self, db: &C) -> Result<PgRow, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.fetch_optional(db)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound("query returned no rows".into()))
    }

    fn statement(self) -> Statement {
        Statement::from_sql_and_values(DbBackend::Postgres, self.sql, self.values)
    }
}

pub trait FromRawRow: Sized {
    fn from_raw_row(row: &PgRow) -> Result<Self, DbErr>;
}

macro_rules! tuple_from_raw_row {
    ($($name:ident:$index:tt),+) => {
        impl<$($name),+> FromRawRow for ($($name,)+)
        where
            $($name: TryGetable,)+
        {
            fn from_raw_row(row: &PgRow) -> Result<Self, DbErr> {
                Ok(($(row.try_get($index)?,)+))
            }
        }
    };
}

tuple_from_raw_row!(A:0);
tuple_from_raw_row!(A:0, B:1);
tuple_from_raw_row!(A:0, B:1, C:2);
tuple_from_raw_row!(A:0, B:1, C:2, D:3);
tuple_from_raw_row!(A:0, B:1, C:2, D:3, E:4);
tuple_from_raw_row!(A:0, B:1, C:2, D:3, E:4, F:5);
tuple_from_raw_row!(A:0, B:1, C:2, D:3, E:4, F:5, G:6);
tuple_from_raw_row!(A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7);

pub struct QueryAs<T> {
    query: Query,
    marker: PhantomData<T>,
}

pub fn query_as<T>(sql: impl Into<String>) -> QueryAs<T> {
    QueryAs {
        query: query(sql),
        marker: PhantomData,
    }
}

impl<T> QueryAs<T>
where
    T: FromRawRow,
{
    pub fn bind<V>(mut self, value: V) -> Self
    where
        V: Into<Value>,
    {
        self.query = self.query.bind(value);
        self
    }

    pub async fn fetch_all<C>(self, db: &C) -> Result<Vec<T>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.query
            .fetch_all(db)
            .await?
            .iter()
            .map(T::from_raw_row)
            .collect()
    }

    pub async fn fetch_optional<C>(self, db: &C) -> Result<Option<T>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.query
            .fetch_optional(db)
            .await?
            .as_ref()
            .map(T::from_raw_row)
            .transpose()
    }

    pub async fn fetch_one<C>(self, db: &C) -> Result<T, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        T::from_raw_row(&self.query.fetch_one(db).await?)
    }
}

pub struct QueryScalar<T> {
    query: Query,
    marker: PhantomData<T>,
}

pub fn query_scalar<T>(sql: impl Into<String>) -> QueryScalar<T> {
    QueryScalar {
        query: query(sql),
        marker: PhantomData,
    }
}

impl<T> QueryScalar<T>
where
    T: TryGetable,
{
    pub fn bind<V>(mut self, value: V) -> Self
    where
        V: Into<Value>,
    {
        self.query = self.query.bind(value);
        self
    }

    pub async fn fetch_all<C>(self, db: &C) -> Result<Vec<T>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.query
            .fetch_all(db)
            .await?
            .iter()
            .map(|row| row.try_get(0))
            .collect()
    }

    pub async fn fetch_optional<C>(self, db: &C) -> Result<Option<T>, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.query
            .fetch_optional(db)
            .await?
            .as_ref()
            .map(|row| row.try_get(0))
            .transpose()
    }

    pub async fn fetch_one<C>(self, db: &C) -> Result<T, DbErr>
    where
        C: RawConnection + ?Sized,
    {
        self.query.fetch_one(db).await?.try_get(0)
    }
}
