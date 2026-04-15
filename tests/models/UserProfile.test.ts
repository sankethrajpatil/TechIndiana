import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import UserProfile, { IUserProfile } from '../../src/models/UserProfile';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

beforeEach(async () => {
  await UserProfile.deleteMany({});
});

describe('UserProfile Model', () => {
  it('should create a user profile with required firebaseUid', async () => {
    const profile = await UserProfile.create({ firebaseUid: 'uid_123' });
    expect(profile.firebaseUid).toBe('uid_123');
    expect(profile._id).toBeDefined();
  });

  it('should fail when firebaseUid is missing', async () => {
    await expect(UserProfile.create({})).rejects.toThrow();
  });

  it('should enforce unique firebaseUid constraint', async () => {
    await UserProfile.create({ firebaseUid: 'unique_uid' });
    // Ensure the unique index is built before testing the constraint
    await UserProfile.ensureIndexes();
    await expect(UserProfile.create({ firebaseUid: 'unique_uid' })).rejects.toThrow();
  });

  it('should lowercase and trim email', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_email',
      email: '  John@Example.COM  ',
    });
    expect(profile.email).toBe('john@example.com');
  });

  it('should trim name field', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_name',
      name: '  Sanketh  ',
    });
    expect(profile.name).toBe('Sanketh');
  });

  it('should reject name below minlength', async () => {
    await expect(
      UserProfile.create({ firebaseUid: 'uid_short_name', name: '' })
    ).rejects.toThrow();
  });

  it('should reject empty background', async () => {
    await expect(
      UserProfile.create({ firebaseUid: 'uid_bg', background: '' })
    ).rejects.toThrow();
  });

  it('should reject empty expectations', async () => {
    await expect(
      UserProfile.create({ firebaseUid: 'uid_exp', expectations: '' })
    ).rejects.toThrow();
  });

  it('should store optional study_plan as string', async () => {
    const planJson = JSON.stringify({ plan_title: 'Cloud Architect Path', milestones: [] });
    const profile = await UserProfile.create({
      firebaseUid: 'uid_plan',
      study_plan: planJson,
    });
    expect(profile.study_plan).toBe(planJson);
  });

  it('should store conversation_summary', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_summary',
      conversation_summary: 'User discussed cloud careers.',
    });
    expect(profile.conversation_summary).toBe('User discussed cloud careers.');
  });

  it('should store conversation_history with user role', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_history',
      conversation_history: [
        { role: 'user', content: 'Hello', timestamp: new Date() },
      ],
    });
    expect(profile.conversation_history).toHaveLength(1);
    expect(profile.conversation_history![0].role).toBe('user');
    expect(profile.conversation_history![0].content).toBe('Hello');
  });

  it('should store conversation_history with model role', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_model_history',
      conversation_history: [
        { role: 'model', content: 'Welcome to TechIndiana!', timestamp: new Date() },
      ],
    });
    expect(profile.conversation_history![0].role).toBe('model');
  });

  it('should reject invalid conversation_history role', async () => {
    await expect(
      UserProfile.create({
        firebaseUid: 'uid_invalid_role',
        conversation_history: [
          { role: 'admin', content: 'Invalid', timestamp: new Date() },
        ],
      })
    ).rejects.toThrow();
  });

  it('should default conversation_history timestamp to now', async () => {
    const before = new Date();
    const profile = await UserProfile.create({
      firebaseUid: 'uid_default_ts',
      conversation_history: [{ role: 'user', content: 'test' }],
    });
    const ts = profile.conversation_history![0].timestamp;
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it('should store saved_memories array', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_memories',
      saved_memories: ['Wants to learn Python', 'Works at retail'],
    });
    expect(profile.saved_memories).toHaveLength(2);
    expect(profile.saved_memories![0]).toBe('Wants to learn Python');
  });

  it('should trim saved_memories entries', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_trim_mem',
      saved_memories: ['  Trimmed fact  '],
    });
    expect(profile.saved_memories![0]).toBe('Trimmed fact');
  });

  it('should add timestamps (createdAt, updatedAt)', async () => {
    const profile = await UserProfile.create({ firebaseUid: 'uid_timestamps' });
    const doc = profile.toObject() as any;
    expect(doc.createdAt).toBeDefined();
    expect(doc.updatedAt).toBeDefined();
  });

  it('should update profile via findOneAndUpdate', async () => {
    await UserProfile.create({ firebaseUid: 'uid_update' });
    const updated = await UserProfile.findOneAndUpdate(
      { firebaseUid: 'uid_update' },
      { name: 'Updated Name', background: 'CS Background' },
      { new: true }
    );
    expect(updated!.name).toBe('Updated Name');
    expect(updated!.background).toBe('CS Background');
  });

  it('should push to saved_memories via $push', async () => {
    await UserProfile.create({
      firebaseUid: 'uid_push',
      saved_memories: ['Fact 1'],
    });
    const updated = await UserProfile.findOneAndUpdate(
      { firebaseUid: 'uid_push' },
      { $push: { saved_memories: 'Fact 2' } },
      { new: true }
    );
    expect(updated!.saved_memories).toHaveLength(2);
    expect(updated!.saved_memories![1]).toBe('Fact 2');
  });

  it('should push to conversation_history via $push', async () => {
    await UserProfile.create({ firebaseUid: 'uid_push_hist' });
    const updated = await UserProfile.findOneAndUpdate(
      { firebaseUid: 'uid_push_hist' },
      { $push: { conversation_history: { role: 'user', content: 'New message', timestamp: new Date() } } },
      { new: true }
    );
    expect(updated!.conversation_history).toHaveLength(1);
  });

  it('should store all fields together', async () => {
    const profile = await UserProfile.create({
      firebaseUid: 'uid_full',
      email: 'test@tecIndiana.edu',
      name: 'Sanketh',
      background: 'Software Engineering',
      expectations: 'Learn cloud architecture',
      study_plan: '{"plan_title":"Cloud Path"}',
      conversation_summary: 'Discussed AWS certs.',
      conversation_history: [
        { role: 'user', content: 'I want to learn AWS', timestamp: new Date() },
        { role: 'model', content: 'Great choice!', timestamp: new Date() },
      ],
      saved_memories: ['Has prior coding experience'],
    });

    expect(profile.firebaseUid).toBe('uid_full');
    expect(profile.email).toBe('test@tecindiana.edu');
    expect(profile.name).toBe('Sanketh');
    expect(profile.conversation_history).toHaveLength(2);
    expect(profile.saved_memories).toHaveLength(1);
  });
});
