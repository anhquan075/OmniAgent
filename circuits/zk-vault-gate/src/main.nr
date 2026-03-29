fn age_verification(current_year: u16, birth_year: u16, minimum_age: u8) {
    assert(current_year >= birth_year);
    let age = current_year - birth_year;
    assert(age >= minimum_age as u16);
}

fn jurisdiction_check(country_code: u16) {
    let sanctioned_us: u16 = 840;
    let sanctioned_ru: u16 = 643;
    let sanctioned_ir: u16 = 364;
    let sanctioned_kp: u16 = 408;
    let sanctioned_sy: u16 = 760;
    let sanctioned_cu: u16 = 192;

    assert(country_code != sanctioned_us);
    assert(country_code != sanctioned_ru);
    assert(country_code != sanctioned_ir);
    assert(country_code != sanctioned_kp);
    assert(country_code != sanctioned_sy);
    assert(country_code != sanctioned_cu);
}

fn kyc_level_check(kyc_level: u8, required_level: u8) {
    assert(kyc_level >= required_level);
}

fn agent_authorization(agent_holder: Field, subject: Field, agent_token_id: u32) {
    assert(agent_holder == subject);
    assert(agent_token_id > 0);
}

fn main(
    current_year: u16,
    required_kyc_level: u8,
    subject: Field,
    agent_token_id: u32,
    proof_valid_until: u64,
    nullifier: Field,
    birth_year: u16,
    country_code: u16,
    kyc_level: u8,
    agent_holder: Field,
) {
    age_verification(current_year, birth_year, 18);
    jurisdiction_check(country_code);
    kyc_level_check(kyc_level, required_kyc_level);
    agent_authorization(agent_holder, subject, agent_token_id);

    assert(proof_valid_until > 0);
    assert(nullifier != 0);
}
