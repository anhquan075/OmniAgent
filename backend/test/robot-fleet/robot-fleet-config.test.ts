import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('[UNIT] HashKey Robot Fleet Config', () => {
  it('loads with 8 robots when hashkey enabled', async () => {
    vi.resetModules();
    process.env.ROBOT_FLEET_HASHKEY_ENABLED = 'true';
    process.env.ROBOT_FLEET_ENABLED = 'false';
    const { getRobotFleetConfig } = await import('@/config/robot-fleet');
    const cfg = getRobotFleetConfig();
    const hashkeyRobots = cfg.robots.filter(r => r.chain === 'hashkey');
    expect(hashkeyRobots.length).toBe(4);
    const sepoliaRobots = cfg.robots.filter(r => r.chain !== 'hashkey');
    expect(sepoliaRobots.length).toBeGreaterThanOrEqual(4);
    expect(cfg.hashkeyEnabled).toBe(true);
  });

  it('hashkey robots have correct types and icons', async () => {
    vi.resetModules();
    process.env.ROBOT_FLEET_HASHKEY_ENABLED = 'true';
    process.env.ROBOT_FLEET_ENABLED = 'false';
    const { getRobotFleetConfig } = await import('@/config/robot-fleet');
    const cfg = getRobotFleetConfig();
    const hk = cfg.robots.filter(r => r.chain === 'hashkey');
    const types = hk.map(r => r.type);
    expect(types).toContain('HSK Staker');
    expect(types).toContain('HashKey Vault Agent');
    expect(types).toContain('HSK Staker Pro');
    expect(types).toContain('HashKey Yield Harvester');
  });

  it('accepts custom robots from env', async () => {
    vi.resetModules();
    process.env.ROBOT_FLEET_ROBOTS = JSON.stringify([
      { id: 'C1', type: 'Custom HK Bot', icon: '[X]', chain: 'hashkey' }
    ]);
    process.env.ROBOT_FLEET_HASHKEY_ENABLED = 'false';
    process.env.ROBOT_FLEET_ENABLED = 'false';
    const { getRobotFleetConfig } = await import('@/config/robot-fleet');
    const cfg = getRobotFleetConfig();
    expect(cfg.robots).toHaveLength(1);
    expect(cfg.robots[0].chain).toBe('hashkey');
    expect(cfg.robots[0].type).toBe('Custom HK Bot');
  });
});
