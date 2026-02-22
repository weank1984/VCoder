/**
 * Capability Orchestrator Tests
 * Tests for capability registration, dependency ordering, initialization, and shutdown
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Capability } from '../../apps/vscode-extension/src/services/capabilityOrchestrator.js';

// Mock all dependencies that capabilityOrchestrator imports
vi.mock('../../apps/vscode-extension/src/services/sessionStore', () => ({
    SessionStore: class {},
}));

vi.mock('../../apps/vscode-extension/src/services/auditLogger', () => ({
    AuditLogger: class {},
}));

vi.mock('../../apps/vscode-extension/src/services/builtinMcpServer', () => ({
    BuiltinMcpServer: class {},
}));

vi.mock('../../apps/vscode-extension/src/services/lspService', () => ({
    LspService: class {},
}));

const createMockContext = () => ({
    subscriptions: [],
    extensionPath: '/mock/extension',
    workspaceState: {
        get: vi.fn(),
        update: vi.fn(),
        keys: vi.fn(() => []),
    },
    globalState: {
        get: vi.fn(),
        update: vi.fn(),
        keys: vi.fn(() => []),
        setKeysForSync: vi.fn(),
    },
    secrets: {
        get: vi.fn(async () => 'test-key'),
        store: vi.fn(),
    },
    extensionMode: 2,
});

function createMockCapability(overrides: Partial<Capability> & { name: string }): Capability {
    return {
        dependencies: [],
        conflicts: [],
        initialize: vi.fn(async () => {}),
        shutdown: vi.fn(async () => {}),
        getStatus: vi.fn(() => 'idle'),
        ...overrides,
    };
}

describe('CapabilityOrchestrator', () => {
    let orchestrator: InstanceType<typeof import('../../apps/vscode-extension/src/services/capabilityOrchestrator.js').CapabilityOrchestrator>;

    beforeEach(async () => {
        const { CapabilityOrchestrator } = await import(
            '../../apps/vscode-extension/src/services/capabilityOrchestrator.js'
        );
        orchestrator = new CapabilityOrchestrator(createMockContext() as any);
    });

    describe('registerCapability', () => {
        it('should register a capability', () => {
            const cap = createMockCapability({ name: 'testCap' });

            orchestrator.registerCapability(cap);

            expect(orchestrator.getCapability('testCap')).toBe(cap);
        });

        it('should register multiple capabilities', () => {
            const capA = createMockCapability({ name: 'capA' });
            const capB = createMockCapability({ name: 'capB' });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);

            expect(orchestrator.getCapability('capA')).toBe(capA);
            expect(orchestrator.getCapability('capB')).toBe(capB);
        });
    });

    describe('conflict detection', () => {
        it('should throw when registering a capability that conflicts with an existing one', () => {
            const capA = createMockCapability({ name: 'capA' });
            const capB = createMockCapability({ name: 'capB', conflicts: ['capA'] });

            orchestrator.registerCapability(capA);

            expect(() => orchestrator.registerCapability(capB)).toThrow(
                /Cannot register capability 'capB': conflicts with capA/
            );
        });

        it('should throw when existing capability declares conflict with the new one', () => {
            const capA = createMockCapability({ name: 'capA', conflicts: ['capB'] });
            const capB = createMockCapability({ name: 'capB' });

            orchestrator.registerCapability(capA);

            expect(() => orchestrator.registerCapability(capB)).toThrow(
                /Cannot register capability 'capB': conflicts with capA/
            );
        });

        it('should not throw when there are no conflicts', () => {
            const capA = createMockCapability({ name: 'capA', conflicts: ['capC'] });
            const capB = createMockCapability({ name: 'capB', conflicts: ['capD'] });

            orchestrator.registerCapability(capA);

            expect(() => orchestrator.registerCapability(capB)).not.toThrow();
        });
    });

    describe('initialization order', () => {
        it('should initialize dependencies before dependents', async () => {
            const initOrder: string[] = [];
            const capA = createMockCapability({
                name: 'capA',
                dependencies: ['capB'],
                initialize: vi.fn(async () => { initOrder.push('capA'); }),
            });
            const capB = createMockCapability({
                name: 'capB',
                dependencies: [],
                initialize: vi.fn(async () => { initOrder.push('capB'); }),
            });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            await orchestrator.initialize();

            expect(initOrder.indexOf('capB')).toBeLessThan(initOrder.indexOf('capA'));
        });

        it('should handle multi-level dependency chains', async () => {
            const initOrder: string[] = [];
            const capC = createMockCapability({
                name: 'capC',
                dependencies: ['capB'],
                initialize: vi.fn(async () => { initOrder.push('capC'); }),
            });
            const capB = createMockCapability({
                name: 'capB',
                dependencies: ['capA'],
                initialize: vi.fn(async () => { initOrder.push('capB'); }),
            });
            const capA = createMockCapability({
                name: 'capA',
                dependencies: [],
                initialize: vi.fn(async () => { initOrder.push('capA'); }),
            });

            orchestrator.registerCapability(capC);
            orchestrator.registerCapability(capB);
            orchestrator.registerCapability(capA);
            await orchestrator.initialize();

            expect(initOrder).toEqual(['capA', 'capB', 'capC']);
        });

        it('should handle capabilities with no dependencies', async () => {
            const initOrder: string[] = [];
            const capA = createMockCapability({
                name: 'capA',
                initialize: vi.fn(async () => { initOrder.push('capA'); }),
            });
            const capB = createMockCapability({
                name: 'capB',
                initialize: vi.fn(async () => { initOrder.push('capB'); }),
            });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            await orchestrator.initialize();

            expect(initOrder).toHaveLength(2);
            expect(initOrder).toContain('capA');
            expect(initOrder).toContain('capB');
        });
    });

    describe('initialize', () => {
        it('should call initialize on each registered capability', async () => {
            const capA = createMockCapability({ name: 'capA' });
            const capB = createMockCapability({ name: 'capB' });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            await orchestrator.initialize();

            expect(capA.initialize).toHaveBeenCalledOnce();
            expect(capB.initialize).toHaveBeenCalledOnce();
        });

        it('should set status to ready on success', async () => {
            const cap = createMockCapability({ name: 'testCap' });

            orchestrator.registerCapability(cap);
            await orchestrator.initialize();

            expect(orchestrator.getStatus()).toBe('ready');
        });

        it('should set status to error when a capability fails to initialize', async () => {
            const failingCap = createMockCapability({
                name: 'failCap',
                initialize: vi.fn(async () => {
                    throw new Error('init failed');
                }),
            });

            orchestrator.registerCapability(failingCap);

            await expect(orchestrator.initialize()).rejects.toThrow('Failed to initialize capability failCap');
            expect(orchestrator.getStatus()).toBe('error');
        });

        it('should emit statusChange events during initialization', async () => {
            const statusChanges: string[] = [];
            orchestrator.on('statusChange', (status: string) => statusChanges.push(status));

            const cap = createMockCapability({ name: 'testCap' });
            orchestrator.registerCapability(cap);
            await orchestrator.initialize();

            expect(statusChanges).toContain('initializing');
            expect(statusChanges).toContain('ready');
        });
    });

    describe('shutdown', () => {
        it('should call shutdown on each capability in reverse order', async () => {
            const shutdownOrder: string[] = [];
            const capA = createMockCapability({
                name: 'capA',
                dependencies: ['capB'],
                shutdown: vi.fn(async () => { shutdownOrder.push('capA'); }),
            });
            const capB = createMockCapability({
                name: 'capB',
                dependencies: [],
                shutdown: vi.fn(async () => { shutdownOrder.push('capB'); }),
            });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            await orchestrator.initialize();
            await orchestrator.shutdown();

            // Init order: capB, capA. Shutdown order should be reversed: capA, capB
            expect(shutdownOrder).toEqual(['capA', 'capB']);
        });

        it('should continue shutdown even when one capability fails', async () => {
            const shutdownOrder: string[] = [];
            const capA = createMockCapability({
                name: 'capA',
                shutdown: vi.fn(async () => {
                    throw new Error('shutdown failed');
                }),
            });
            const capB = createMockCapability({
                name: 'capB',
                shutdown: vi.fn(async () => { shutdownOrder.push('capB'); }),
            });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            await orchestrator.initialize();
            await orchestrator.shutdown();

            // capB should still have been shut down
            expect(capB.shutdown).toHaveBeenCalledOnce();
            expect(shutdownOrder).toContain('capB');
        });

        it('should reset status to starting after shutdown', async () => {
            const cap = createMockCapability({ name: 'testCap' });

            orchestrator.registerCapability(cap);
            await orchestrator.initialize();
            await orchestrator.shutdown();

            expect(orchestrator.getStatus()).toBe('starting');
        });
    });

    describe('getCapabilityStatuses', () => {
        it('should return correct status map for registered capabilities', () => {
            const capA = createMockCapability({
                name: 'capA',
                getStatus: vi.fn(() => 'ready'),
            });
            const capB = createMockCapability({
                name: 'capB',
                getStatus: vi.fn(() => 'idle'),
            });
            const capC = createMockCapability({
                name: 'capC',
                getStatus: vi.fn(() => 'error'),
            });

            orchestrator.registerCapability(capA);
            orchestrator.registerCapability(capB);
            orchestrator.registerCapability(capC);

            const statuses = orchestrator.getCapabilityStatuses();

            expect(statuses).toEqual({
                capA: 'ready',
                capB: 'idle',
                capC: 'error',
            });
        });

        it('should return empty object when no capabilities are registered', () => {
            const statuses = orchestrator.getCapabilityStatuses();
            expect(statuses).toEqual({});
        });
    });

    describe('getCapability', () => {
        it('should return the capability if registered', () => {
            const cap = createMockCapability({ name: 'myCap' });
            orchestrator.registerCapability(cap);

            expect(orchestrator.getCapability('myCap')).toBe(cap);
        });

        it('should return undefined for unregistered capability', () => {
            expect(orchestrator.getCapability('nonexistent')).toBeUndefined();
        });
    });

    describe('getStatus', () => {
        it('should return starting initially', () => {
            expect(orchestrator.getStatus()).toBe('starting');
        });

        it('should return ready after successful initialization', async () => {
            const cap = createMockCapability({ name: 'testCap' });
            orchestrator.registerCapability(cap);
            await orchestrator.initialize();

            expect(orchestrator.getStatus()).toBe('ready');
        });

        it('should return error after failed initialization', async () => {
            const cap = createMockCapability({
                name: 'failCap',
                initialize: vi.fn(async () => { throw new Error('boom'); }),
            });
            orchestrator.registerCapability(cap);

            await expect(orchestrator.initialize()).rejects.toThrow();

            expect(orchestrator.getStatus()).toBe('error');
        });
    });
});
