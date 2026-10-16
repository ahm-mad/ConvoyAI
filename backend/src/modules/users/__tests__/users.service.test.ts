import { describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users.service.js';
import { fakeRoleLookup, fakeUsersRepository } from './fakes.js';
import type { CreateMemberInput, Member, Profile } from '../users.types.js';

vi.mock('../../../platform/storage/r2-storage.js', () => ({
  uploadObject: vi.fn().mockResolvedValue({
    key: 'profile-images/new.png',
    url: 'https://images.example.com/profile-images/new.png',
  }),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  keyFromUrl: (url: string) =>
    url.startsWith('https://images.example.com/')
      ? url.slice('https://images.example.com/'.length)
      : undefined,
}));

const PROFILE: Profile = {
  id: '1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  number: '555',
  companyId: '1',
  status: 'Active',
  emailVerifiedAt: new Date(),
  profileImage: null,
  timezone: null,
  companyDomain: null,
  socialProvider: null,
  socialProviderId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  stripeId: null,
  pmType: null,
  pmLastFour: null,
  trialEndsAt: null,
};

const MEMBER_INPUT: CreateMemberInput = {
  firstName: 'Grace',
  lastName: 'Hopper',
  number: '555',
  email: 'grace@example.com',
  address: undefined,
  city: undefined,
  state: undefined,
  country: undefined,
  role: 'Hr',
  password: undefined,
};

describe('UsersService', () => {
  describe('profile', () => {
    it('getProfile 401s for a missing user', async () => {
      const { repository } = fakeUsersRepository();
      const service = new UsersService(repository, fakeRoleLookup());

      await expect(service.getProfile('999')).rejects.toMatchObject({ httpStatus: 401 });
    });

    it('updateProfile rejects an email already taken by another user', async () => {
      const other: Profile = { ...PROFILE, id: '2', email: 'taken@example.com' };
      const { repository } = fakeUsersRepository([PROFILE, other]);
      const service = new UsersService(repository, fakeRoleLookup());

      await expect(
        service.updateProfile(
          '1',
          { firstName: 'Ada', lastName: 'Lovelace', email: 'taken@example.com', number: '555' },
          undefined
        )
      ).rejects.toMatchObject({ httpStatus: 422 });
    });

    it('updateProfile without an image leaves profileImage untouched', async () => {
      const withImage: Profile = {
        ...PROFILE,
        profileImage: 'https://images.example.com/profile-images/old.png',
      };
      const { repository } = fakeUsersRepository([withImage]);
      const service = new UsersService(repository, fakeRoleLookup());

      const updated = await service.updateProfile(
        '1',
        { firstName: 'Ada', lastName: 'L', email: 'ada@example.com', number: '555' },
        undefined
      );

      expect(updated.profileImage).toBe('https://images.example.com/profile-images/old.png');
    });

    it('updateProfile with an image uploads and replaces the URL, deleting the old one', async () => {
      const withImage: Profile = {
        ...PROFILE,
        profileImage: 'https://images.example.com/profile-images/old.png',
      };
      const { repository } = fakeUsersRepository([withImage]);
      const service = new UsersService(repository, fakeRoleLookup());
      const { deleteObject, uploadObject } =
        await import('../../../platform/storage/r2-storage.js');

      const updated = await service.updateProfile(
        '1',
        { firstName: 'Ada', lastName: 'L', email: 'ada@example.com', number: '555' },
        { buffer: Buffer.from('x'), contentType: 'image/png', extension: 'png' }
      );

      expect(uploadObject).toHaveBeenCalledOnce();
      expect(deleteObject).toHaveBeenCalledWith('profile-images/old.png');
      expect(updated.profileImage).toBe('https://images.example.com/profile-images/new.png');
    });
  });

  describe('members', () => {
    it("createMember 404s when the role doesn't exist in the caller's company", async () => {
      const { repository } = fakeUsersRepository();
      const service = new UsersService(repository, fakeRoleLookup({}));

      await expect(service.createMember(MEMBER_INPUT, '1')).rejects.toMatchObject({
        httpStatus: 404,
      });
    });

    it('createMember rejects a duplicate email', async () => {
      const { repository } = fakeUsersRepository([{ ...PROFILE, email: 'grace@example.com' }]);
      const service = new UsersService(repository, fakeRoleLookup({ Hr: '10' }));

      await expect(service.createMember(MEMBER_INPUT, '1')).rejects.toMatchObject({
        httpStatus: 422,
      });
    });

    it('createMember succeeds when the role exists and the email is free', async () => {
      const { repository, state } = fakeUsersRepository();
      const service = new UsersService(repository, fakeRoleLookup({ Hr: '10' }));

      await service.createMember(MEMBER_INPUT, '1');

      expect([...state.members.values()].some(m => m.user.email === 'grace@example.com')).toBe(
        true
      );
    });

    it('getMember 404s for a missing/cross-tenant id', async () => {
      const { repository } = fakeUsersRepository();
      const service = new UsersService(repository, fakeRoleLookup());

      await expect(service.getMember('999')).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('bulkDeleteMembers 404s when none of the ids exist', async () => {
      const { repository } = fakeUsersRepository();
      const service = new UsersService(repository, fakeRoleLookup());

      await expect(service.bulkDeleteMembers(['999'])).rejects.toMatchObject({ httpStatus: 404 });
    });

    it('bulkDeleteMembers reports deleted/not_deleted counts', async () => {
      const member: Member = {
        id: '5',
        userId: '1',
        name: 'Grace Hopper',
        address: null,
        city: null,
        state: null,
        country: null,
        companyId: '1',
        createdBy: '1',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          ...PROFILE,
          id: '1',
          firstName: 'Grace',
          lastName: 'Hopper',
          email: 'grace@example.com',
          number: '555',
          status: 'Active',
          roles: [],
        },
      };
      const { repository } = fakeUsersRepository([], [member]);
      const service = new UsersService(repository, fakeRoleLookup());

      const result = await service.bulkDeleteMembers(['5', '999']);

      expect(result).toEqual({ deletedCount: 1, notDeletedCount: 0 });
    });
  });
});
