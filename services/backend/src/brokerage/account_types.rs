//! Standard US account types, worked out from what the brokerage calls the
//! account. SnapTrade standardises only `kind` and `cash_or_margin`; `raw_type`
//! is each institution's own text, so this is pattern matching and will meet
//! values it does not know. Those classify as `Unknown`, never as a guess.
//!
//! Types are computed when read rather than stored, so improving the rules
//! reclassifies every existing account without a migration.

use async_graphql::Enum;

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccountType {
    Taxable,
    TraditionalIra,
    RolloverIra,
    SepIra,
    SimpleIra,
    RothIra,
    #[graphql(name = "PLAN_401K")]
    Plan401k,
    #[graphql(name = "ROTH_401K")]
    Roth401k,
    #[graphql(name = "PLAN_403B")]
    Plan403b,
    #[graphql(name = "PLAN_457B")]
    Plan457b,
    Hsa,
    #[graphql(name = "PLAN_529")]
    Plan529,
    Custodial,
    Trust,
    Crypto,
    Unknown,
}

/// SnapTrade's own standardised field; Fidelity often reports `unknown`.
#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum CashOrMargin {
    Cash,
    Margin,
    Unknown,
}

impl CashOrMargin {
    /// Values SnapTrade adds later read as `Unknown`.
    pub fn parse(value: Option<&str>) -> Self {
        match value {
            Some("cash") => Self::Cash,
            Some("margin") => Self::Margin,
            _ => Self::Unknown,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cash => "cash",
            Self::Margin => "margin",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaxTreatment {
    Taxable,
    TaxDeferred,
    TaxFree,
    Unknown,
}

impl AccountType {
    pub fn tax_treatment(self) -> TaxTreatment {
        match self {
            Self::Taxable | Self::Custodial | Self::Trust | Self::Crypto => TaxTreatment::Taxable,
            Self::TraditionalIra
            | Self::RolloverIra
            | Self::SepIra
            | Self::SimpleIra
            | Self::Plan401k
            | Self::Plan403b
            | Self::Plan457b => TaxTreatment::TaxDeferred,
            Self::RothIra | Self::Roth401k | Self::Hsa | Self::Plan529 => TaxTreatment::TaxFree,
            Self::Unknown => TaxTreatment::Unknown,
        }
    }
}

/// How much a match says about the account. "Margin" only says the account
/// can borrow, which is almost always a taxable account but not certainly, so
/// it loses to anything the other field says outright.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Strength {
    Strong,
    Weak,
}

/// Classifies from the brokerage's `raw_type`, falling back to the account's
/// display name, which people and brokerages often set to "Roth IRA".
pub fn classify(raw_type: Option<&str>, display_name: &str) -> AccountType {
    let candidates = [raw_type.and_then(match_text), match_text(display_name)];
    candidates
        .iter()
        .flatten()
        .find(|(_, strength)| *strength == Strength::Strong)
        .or_else(|| candidates.iter().flatten().next())
        .map_or(AccountType::Unknown, |(account_type, _)| *account_type)
}

fn match_text(text: &str) -> Option<(AccountType, Strength)> {
    let upper = text.to_ascii_uppercase();
    let words: Vec<&str> = upper
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
        .collect();
    let compact: String = words.concat();
    let has = |word: &str| words.contains(&word);
    let phrase = |phrase: &str| words.join(" ").contains(phrase);
    let plan = |number: &str| compact.contains(number);

    // Order matters: the most specific rule wins, so "Roth 401(k)" is not a
    // Roth IRA and "Rollover IRA" is not a traditional one.
    let strong = if (has("ROTH") || compact.starts_with("ROTH")) && (plan("401") || plan("403")) {
        AccountType::Roth401k
    } else if has("ROTH") || compact.starts_with("ROTHIRA") {
        AccountType::RothIra
    } else if has("ROLLOVER") {
        AccountType::RolloverIra
    } else if has("SEP") {
        AccountType::SepIra
    } else if has("SIMPLE") && (has("IRA") || phrase("RETIREMENT")) {
        AccountType::SimpleIra
    } else if plan("401K") || has("401") {
        AccountType::Plan401k
    } else if plan("403B") {
        AccountType::Plan403b
    } else if plan("457") {
        AccountType::Plan457b
    } else if has("IRA") || has("TRADITIONAL") || phrase("INDIVIDUAL RETIREMENT") {
        AccountType::TraditionalIra
    } else if has("HSA") || phrase("HEALTH SAVINGS") {
        AccountType::Hsa
    } else if plan("529") {
        AccountType::Plan529
    } else if has("UTMA") || has("UGMA") || has("CUSTODIAL") || has("CUSTODIAN") {
        AccountType::Custodial
    } else if has("TRUST") {
        AccountType::Trust
    } else if has("CRYPTO") || has("WALLET") {
        AccountType::Crypto
    } else if [
        "INDIVIDUAL",
        "JOINT",
        "BROKERAGE",
        "TAXABLE",
        "TOD",
        "JTWROS",
        "TENANTS",
        // Webull's event-contracts account.
        "EVENTS",
    ]
    .iter()
    .any(|word| has(word))
    {
        AccountType::Taxable
    } else if has("MARGIN") {
        return Some((AccountType::Taxable, Strength::Weak));
    } else {
        return None;
    };
    Some((strong, Strength::Strong))
}

#[cfg(test)]
mod tests {
    use super::*;
    use AccountType::*;

    #[test]
    fn classifies_common_brokerage_labels() {
        let cases: &[(&str, AccountType)] = &[
            ("INDIVIDUAL", Taxable),
            ("Individual Brokerage", Taxable),
            ("Joint Tenants WROS", Taxable),
            ("JTWROS", Taxable),
            ("ROTH", RothIra),
            ("Roth IRA", RothIra),
            ("ROTH_IRA", RothIra),
            ("ira_roth", RothIra),
            ("RothIRA", RothIra),
            ("Traditional IRA", TraditionalIra),
            ("IRA", TraditionalIra),
            ("ira_traditional", TraditionalIra),
            ("Individual Retirement Account", TraditionalIra),
            ("Rollover IRA", RolloverIra),
            ("SEP IRA", SepIra),
            ("SEP-IRA", SepIra),
            ("SIMPLE IRA", SimpleIra),
            ("401(k)", Plan401k),
            ("401K", Plan401k),
            ("Individual 401k", Plan401k),
            ("Roth 401(k)", Roth401k),
            ("ROTH401K", Roth401k),
            ("Roth 403(b)", Roth401k),
            ("403(b)", Plan403b),
            ("457(b)", Plan457b),
            ("HSA", Hsa),
            ("Health Savings Account", Hsa),
            ("529 College Savings", Plan529),
            ("UTMA", Custodial),
            ("Custodial", Custodial),
            ("Trust", Trust),
            ("Crypto", Crypto),
            ("Events Cash", Taxable),
        ];
        for (raw, expected) in cases {
            assert_eq!(classify(Some(raw), ""), *expected, "raw_type {raw:?}");
        }
    }

    #[test]
    fn unrecognised_labels_stay_unknown() {
        for raw in ["", "RO", "Cash", "TFSA", "Account"] {
            assert_eq!(classify(Some(raw), "****8443"), Unknown, "raw_type {raw:?}");
        }
        assert_eq!(classify(None, "Account"), Unknown);
    }

    #[test]
    fn words_must_match_whole() {
        assert_eq!(classify(Some("Separate Account"), ""), Unknown);
        assert_eq!(classify(Some("Pirate Fund"), ""), Unknown);
    }

    #[test]
    fn the_display_name_fills_in_when_the_raw_type_says_little() {
        assert_eq!(classify(Some("Cash"), "Roth IRA"), RothIra);
        assert_eq!(classify(None, "My HSA"), Hsa);
        assert_eq!(
            classify(Some("Margin"), "Rollover IRA"),
            RolloverIra,
            "a strong name beats a weak raw type"
        );
        assert_eq!(classify(Some("Margin"), "****8443"), Taxable);
        assert_eq!(
            classify(Some("INDIVIDUAL"), "Roth IRA"),
            Taxable,
            "an explicit raw type beats the name"
        );
    }

    #[test]
    fn cash_or_margin_tolerates_new_values() {
        assert_eq!(CashOrMargin::parse(Some("margin")), CashOrMargin::Margin);
        assert_eq!(
            CashOrMargin::parse(Some("portfolio")),
            CashOrMargin::Unknown
        );
        assert_eq!(CashOrMargin::parse(None).as_str(), "unknown");
    }

    #[test]
    fn tax_treatment_follows_the_type() {
        assert_eq!(RothIra.tax_treatment(), TaxTreatment::TaxFree);
        assert_eq!(Plan401k.tax_treatment(), TaxTreatment::TaxDeferred);
        assert_eq!(Custodial.tax_treatment(), TaxTreatment::Taxable);
        assert_eq!(Unknown.tax_treatment(), TaxTreatment::Unknown);
    }
}
