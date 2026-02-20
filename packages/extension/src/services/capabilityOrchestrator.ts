/**
 * Capability Orchestrator
 * 
 * Coordinates initialization and lifecycle of core VCoder capabilities:
 * - SessionStore (session persistence)
 * - AuditLogger (audit logging)
 * - BuiltinMcpServer (MCP server)
 * 
 * Purpose: Replace independent initialization with orchestrated dependency management,
 * ensuring proper startup order and graceful shutdown.
 */

import { EventEmitter } from 'events';
import type { ExtensionContext } from 'vscode';
import { SessionStore } from './sessionStore';
import { AuditLogger } from './auditLogger';
import { BuiltinMcpServer } from './builtinMcpServer';
import { LspService } from './lspService';

/**
 * Capability interface for components that can be orchestrated
 */
export interface Capability {
    name: string;
    /** Dependencies that must be initialized before this capability */
    dependencies?: string[];
    /** Capabilities that conflict with this one */
    conflicts?: string[];
    /** Initialize the capability */
    initialize(): Promise<void>;
    /** Shutdown the capability gracefully */
    shutdown(): Promise<void>;
    /** Get current status */
    getStatus(): 'idle' | 'initializing' | 'ready' | 'error';
    /** Optional: Get last error if status is 'error' */
    getLastError?(): Error | null;
    /** Optional: Health check */
    healthCheck?(): Promise<boolean>;
    /** Optional: Get capability metadata */
    getMetadata?(): CapabilityMetadata;
}

/**
 * Metadata about a capability
 */
export interface CapabilityMetadata {
    displayName: string;
    description: string;
    version?: string;
    /** Whether this capability is required for core functionality */
    required?: boolean;
    /** Client capabilities required for this capability to function */
    requiredClientCapabilities?: string[];
}

/**
 * Typed capability interfaces
 */
export interface SessionStoreCapability extends Capability {
    name: 'sessionStore';
    dispose(): Promise<void>;
}

export interface AuditLoggerCapability extends Capability {
    name: 'auditLogger';
    dispose(): Promise<void>;
}

export interface BuiltinMcpServerCapability extends Capability {
    name: 'builtinMcpServer';
    start(): Promise<void>;
    stop(): Promise<void>;
    getServerConfig(): { port?: number } | null;
    getStatus(): 'idle' | 'initializing' | 'ready' | 'error';
}

export interface LspServiceCapability extends Capability {
    name: 'lspService';
}

/**
 * Orchestrator status
 */
export type OrchestratorStatus = 'starting' | 'initializing' | 'ready' | 'shutting' | 'error';

/**
 * Main orchestrator for VCoder capabilities
 */
export class CapabilityOrchestrator extends EventEmitter {
    private capabilities = new Map<string, Capability>();
    private status: OrchestratorStatus = 'starting';
    private context: ExtensionContext;
    
    // Store actual instances for type-safe access
    private instances: {
        sessionStore?: SessionStore;
        auditLogger?: AuditLogger;
        builtinMcpServer?: BuiltinMcpServer;
        lspService?: LspService;
    } = {};

    constructor(context: ExtensionContext) {
        super();
        this.context = context;
    }

    /**
     * Register a capability with the orchestrator
     */
    registerCapability(capability: Capability): void {
        // Check for conflicts with already registered capabilities
        const conflicts = this.detectConflicts(capability);
        if (conflicts.length > 0) {
            throw new Error(
                `Cannot register capability '${capability.name}': conflicts with ${conflicts.join(', ')}`
            );
        }

        this.capabilities.set(capability.name, capability);
        console.log(`[CapabilityOrchestrator] Registered capability: ${capability.name}`);
    }

    /**
     * Detect conflicts between a capability and already registered capabilities
     */
    private detectConflicts(capability: Capability): string[] {
        const conflicts: string[] = [];

        for (const [name, existing] of this.capabilities) {
            // Check if new capability conflicts with existing
            if (capability.conflicts?.includes(name)) {
                conflicts.push(name);
            }
            // Check if existing conflicts with new capability
            if (existing.conflicts?.includes(capability.name)) {
                conflicts.push(name);
            }
        }

        return conflicts;
    }

    /**
     * Validate all capability dependencies are met
     */
    private validateDependencies(): string[] {
        const errors: string[] = [];

        for (const [name, capability] of this.capabilities) {
            if (capability.dependencies) {
                for (const dep of capability.dependencies) {
                    if (!this.capabilities.has(dep)) {
                        errors.push(
                            `Capability '${name}' depends on '${dep}' which is not registered`
                        );
                    }
                }
            }
        }

        return errors;
    }

    /**
     * Initialize all capabilities in dependency order
     */
    async initialize(): Promise<void> {
        try {
            this.setStatus('initializing');
            console.log('[CapabilityOrchestrator] Starting capability initialization...');

            // Calculate initialization order based on dependencies
            const initOrder = this.calculateInitializationOrder();
            
            // Initialize capabilities in order
            for (const capabilityName of initOrder) {
                const capability = this.capabilities.get(capabilityName);
                if (!capability) {
                    console.warn(`[CapabilityOrchestrator] Capability not found: ${capabilityName}`);
                    continue;
                }

                try {
                    console.log(`[CapabilityOrchestrator] Initializing: ${capabilityName}`);
                    await capability.initialize();
                    console.log(`[CapabilityOrchestrator] Initialized: ${capabilityName}`);
                } catch (error) {
                    console.error(`[CapabilityOrchestrator] Failed to initialize ${capabilityName}:`, error);
                    throw new Error(`Failed to initialize capability ${capabilityName}: ${error}`);
                }
            }

            this.setStatus('ready');
            console.log('[CapabilityOrchestrator] All capabilities initialized successfully');

        } catch (error) {
            this.setStatus('error');
            console.error('[CapabilityOrchestrator] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Shutdown all capabilities in reverse order
     */
    async shutdown(): Promise<void> {
        try {
            this.setStatus('shutting');
            console.log('[CapabilityOrchestrator] Starting capability shutdown...');

            // Shutdown in reverse initialization order
            const initOrder = this.calculateInitializationOrder();
            const shutdownOrder = [...initOrder].reverse();

            for (const capabilityName of shutdownOrder) {
                const capability = this.capabilities.get(capabilityName);
                if (!capability) {
                    console.warn(`[CapabilityOrchestrator] Capability not found: ${capabilityName}`);
                    continue;
                }

                try {
                    console.log(`[CapabilityOrchestrator] Shutting down: ${capabilityName}`);
                    await capability.shutdown();
                    console.log(`[CapabilityOrchestrator] Shut down: ${capabilityName}`);
                } catch (error) {
                    console.error(`[CapabilityOrchestrator] Failed to shutdown ${capabilityName}:`, error);
                    // Continue with other capabilities even if one fails
                }
            }

            this.setStatus('starting'); // Reset to starting state
            console.log('[CapabilityOrchestrator] All capabilities shut down successfully');

        } catch (error) {
            this.setStatus('error');
            console.error('[CapabilityOrchestrator] Shutdown failed:', error);
            throw error;
        }
    }

    /**
     * Get status of all capabilities
     */
    getCapabilityStatuses(): Record<string, 'idle' | 'initializing' | 'ready' | 'error'> {
        const statuses: Record<string, 'idle' | 'initializing' | 'ready' | 'error'> = {};
        
        for (const [name, capability] of this.capabilities) {
            statuses[name] = capability.getStatus();
        }
        
        return statuses;
    }

    /**
     * Get specific capability
     */
    getCapability(name: string): Capability | undefined {
        return this.capabilities.get(name);
    }

    /**
     * Get current orchestrator status
     */
    getStatus(): OrchestratorStatus {
        return this.status;
    }

/**
     * Get type-safe capability instances
     */
    getSessionStore(): SessionStore | undefined {
        return this.instances.sessionStore;
    }

    getAuditLogger(): AuditLogger | undefined {
        return this.instances.auditLogger;
    }

    getBuiltinMcpServer(): BuiltinMcpServer | undefined {
        return this.instances.builtinMcpServer;
    }

    getLspService(): LspService | undefined {
        return this.instances.lspService;
    }

    /**
     * Store instances for type-safe access (used by factory function)
     */
    setInstances(instances: {
        sessionStore?: SessionStore;
        auditLogger?: AuditLogger;
        builtinMcpServer?: BuiltinMcpServer;
        lspService?: LspService;
    }): void {
        this.instances = instances;
    }

    /**
     * Get current orchestrator status
     */
    private setStatus(status: OrchestratorStatus): void {
        if (this.status !== status) {
            this.status = status;
            this.emit('statusChange', status);
        }
    }

    /**
     * Calculate initialization order based on dependencies
     */
    private calculateInitializationOrder(): string[] {
        const order: string[] = [];
        const visited = new Set<string>();
        const visiting = new Set<string>();

        const visit = (name: string) => {
            if (visiting.has(name)) {
                // Circular dependency detected
                console.warn(`[CapabilityOrchestrator] Circular dependency detected: ${name}`);
                return;
            }
            
            visiting.add(name);
            visited.add(name);

            const capability = this.capabilities.get(name);
            if (capability?.dependencies) {
                for (const dep of capability.dependencies) {
                    if (!visited.has(dep)) {
                        visit(dep);
                    }
                }
            }
            
            order.push(name);
            visiting.delete(name);
        };

        // Visit all registered capabilities
        for (const name of this.capabilities.keys()) {
            if (!visited.has(name)) {
                visit(name);
            }
        }

        return order;
    }
}

/**
 * Factory function to create and initialize the orchestrator with all capabilities
 */
export async function createCapabilityOrchestrator(context: ExtensionContext): Promise<CapabilityOrchestrator> {
    const orchestrator = new CapabilityOrchestrator(context);

    // Create and register capabilities
    const sessionStore = new SessionStore(context, context.workspaceState, context.globalState);
    const auditLogger = new AuditLogger(context);
    const builtinMcpServer = new BuiltinMcpServer(context);
    const lspService = new LspService(context);

    // Register capabilities with their dependencies
    const sessionStoreCap: SessionStoreCapability = {
        name: 'sessionStore',
        dependencies: [],
        initialize: async () => {
            // SessionStore doesn't need explicit initialization - it's already initialized in constructor
            console.log('[CapabilityOrchestrator] SessionStore ready');
        },
        shutdown: async () => {
            await sessionStore.dispose();
        },
        getStatus: () => 'ready',
        dispose: async () => {
            await sessionStore.dispose();
        }
    };

    const auditLoggerCap: AuditLoggerCapability = {
        name: 'auditLogger',
        dependencies: [],
        initialize: async () => {
            // AuditLogger doesn't need explicit initialization - it's already initialized in constructor
            console.log('[CapabilityOrchestrator] AuditLogger ready');
        },
        shutdown: async () => {
            await auditLogger.dispose();
        },
        getStatus: () => 'ready',
        dispose: async () => {
            await auditLogger.dispose();
        }
    };

    const builtinMcpServerCap: BuiltinMcpServerCapability = {
        name: 'builtinMcpServer',
        dependencies: ['sessionStore'], // MCP server needs session store
        initialize: async () => {
            await builtinMcpServer.start();
        },
        shutdown: async () => {
            await builtinMcpServer.stop();
        },
        getStatus: () => {
            // Check if server is running by checking if it has assigned port
            const config = builtinMcpServer.getServerConfig();
            return config ? 'ready' : 'idle';
        },
        start: async () => {
            await builtinMcpServer.start();
        },
        stop: async () => {
            await builtinMcpServer.stop();
        },
        getServerConfig: () => {
            try {
                const config = builtinMcpServer.getServerConfig();
                return config?.url ? { port: parseInt(config.url.split(':')[2]) } : null;
            } catch {
                return null;
            }
        }
    };

    const lspServiceCap: LspServiceCapability = {
        name: 'lspService',
        dependencies: [],
        initialize: async () => {
            // LspService doesn't need explicit initialization
            console.log('[CapabilityOrchestrator] LspService ready');
        },
        shutdown: async () => {
            // No cleanup needed for LspService
        },
        getStatus: () => 'ready'
    };

    orchestrator.registerCapability(sessionStoreCap);
    orchestrator.registerCapability(auditLoggerCap);
    orchestrator.registerCapability(builtinMcpServerCap);
    orchestrator.registerCapability(lspServiceCap);

    // Store the instances for type-safe access
    orchestrator.setInstances({
        sessionStore,
        auditLogger,
        builtinMcpServer,
        lspService
    });

    // Initialize all capabilities
    await orchestrator.initialize();

    return orchestrator;
}