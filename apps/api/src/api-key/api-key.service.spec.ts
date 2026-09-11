/*
 * Copyright 2025 Daytona Platforms Inc.
 * Modified by BoxLite AI, 2025-2026
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiKeyService } from './api-key.service'

function createService() {
  const apiKeyRepository = { update: jest.fn().mockResolvedValue({ affected: 1 }) }
  const redisLockProvider = { lock: jest.fn().mockResolvedValue(true) }
  const redis = { del: jest.fn() }
  const configService = { get: jest.fn(), getOrThrow: jest.fn() }

  return {
    service: new ApiKeyService(apiKeyRepository as any, redisLockProvider as any, redis as any, configService as any),
    mocks: { apiKeyRepository, redisLockProvider, redis, configService },
  }
}

describe('ApiKeyService.updateLastUsedAt', () => {
  it('records the timestamp when the throttling lock is acquired', async () => {
    const { service, mocks } = createService()
    const lastUsedAt = new Date()

    await service.updateLastUsedAt('org-1', 'user-1', 'default', lastUsedAt)

    expect(mocks.apiKeyRepository.update).toHaveBeenCalledWith(
      { organizationId: 'org-1', userId: 'user-1', name: 'default' },
      { lastUsedAt },
    )
  })

  // The lock only throttles this write, so a Redis outage must not reach the
  // caller: an unhandled rejection here aborts authentication with a 401.
  it('skips the write without throwing when Redis is unavailable', async () => {
    const { service, mocks } = createService()
    mocks.redisLockProvider.lock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'))

    await expect(service.updateLastUsedAt('org-1', 'user-1', 'default', new Date())).resolves.toBeUndefined()

    expect(mocks.apiKeyRepository.update).not.toHaveBeenCalled()
  })

  it('skips the write when another request holds the cooldown lock', async () => {
    const { service, mocks } = createService()
    mocks.redisLockProvider.lock.mockResolvedValue(false)

    await service.updateLastUsedAt('org-1', 'user-1', 'default', new Date())

    expect(mocks.apiKeyRepository.update).not.toHaveBeenCalled()
  })
})
