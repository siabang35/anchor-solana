import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service.js';
import {
    NotificationDto,
    NotificationsQueryDto,
    NotificationPreferencesDto,
    UpdateNotificationPreferencesDto,
    NotificationType,
    NotificationChannel,
} from './dto/index.js';

/**
 * NotificationsService
 * 
 * Manages user notifications:
 * - Fetch notifications with pagination
 * - Mark as read (single/all)
 * - Manage notification preferences
 * - Create notifications (internal use)
 */
@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(private readonly supabaseService: SupabaseService) { }

    // ========================================================================
    // GET NOTIFICATIONS
    // ========================================================================

    /**
     * Get user notifications with pagination and filters
     */
    async getNotifications(
        userId: string,
        query: NotificationsQueryDto,
    ): Promise<{ data: NotificationDto[]; total: number }> {
        const { page = 1, limit = 20, isRead, type } = query;
        const offset = (page - 1) * limit;

        let queryBuilder = this.supabaseService
            .getAdminClient()
            .from('notifications')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .eq('is_archived', false)
            .order('created_at', { ascending: false });

        if (typeof isRead === 'boolean') {
            queryBuilder = queryBuilder.eq('is_read', isRead);
        }

        if (type) {
            queryBuilder = queryBuilder.eq('notification_type', type);
        }

        queryBuilder = queryBuilder.range(offset, offset + limit - 1);

        const { data, error, count } = await queryBuilder;

        if (error) {
            this.logger.error(`Failed to fetch notifications: ${error.message}`);
            return { data: [], total: 0 };
        }

        return {
            data: (data || []).map(this.mapToNotificationDto),
            total: count || 0,
        };
    }

    /**
     * Get unread notification count
     */
    async getUnreadCount(userId: string): Promise<number> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .rpc('get_unread_notification_count', { p_user_id: userId });

        if (error) {
            this.logger.error(`Failed to get unread count: ${error.message}`);
            return 0;
        }

        return data || 0;
    }

    // ========================================================================
    // MARK AS READ
    // ========================================================================

    /**
     * Mark a single notification as read
     */
    async markAsRead(userId: string, notificationId: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .rpc('mark_notification_read', {
                p_user_id: userId,
                p_notification_id: notificationId,
            });

        if (error) {
            this.logger.error(`Failed to mark notification as read: ${error.message}`);
            throw new NotFoundException('Notification not found');
        }

        return { success: true };
    }

    /**
     * Mark all notifications as read
     */
    async markAllAsRead(userId: string): Promise<{ success: boolean; count: number }> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .rpc('mark_all_notifications_read', { p_user_id: userId });

        if (error) {
            this.logger.error(`Failed to mark all as read: ${error.message}`);
            return { success: false, count: 0 };
        }

        return { success: true, count: data || 0 };
    }

    /**
     * Archive a notification
     */
    async archiveNotification(userId: string, notificationId: string): Promise<{ success: boolean }> {
        const { error } = await this.supabaseService
            .getAdminClient()
            .from('notifications')
            .update({ is_archived: true })
            .eq('id', notificationId)
            .eq('user_id', userId);

        if (error) {
            this.logger.error(`Failed to archive notification: ${error.message}`);
            throw new NotFoundException('Notification not found');
        }

        return { success: true };
    }

    // ========================================================================
    // PREFERENCES
    // ========================================================================

    /**
     * Get notification preferences
     */
    async getPreferences(userId: string): Promise<NotificationPreferencesDto> {
        const { data, error } = await this.supabaseService
            .getAdminClient()
            .from('notification_preferences')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            this.logger.error(`Failed to get preferences: ${error.message}`);
        }

        // Build preferences from records or return defaults
        const typePreferences: Record<NotificationType, boolean> = {} as any;
        const channelPreferences: Record<NotificationChannel, boolean> = {} as any;

        // Set defaults
        Object.values(NotificationType).forEach(t => typePreferences[t] = true);
        Object.values(NotificationChannel).forEach(c => channelPreferences[c] = true);

        // Apply user preferences
        (data || []).forEach(pref => {
            if (pref.notification_type && pref.channel) {
                // Per-type per-channel preference
                // For simplicity, we'll just track if channel is enabled
                channelPreferences[pref.channel as NotificationChannel] = pref.is_enabled;
            }
        });

        return {
            typePreferences,
            channelPreferences,
            quietHoursStart: undefined,
            quietHoursEnd: undefined,
        };
    }

    /**
     * Update notification preferences
     */
    async updatePreferences(
        userId: string,
        dto: UpdateNotificationPreferencesDto,
    ): Promise<NotificationPreferencesDto> {
        // For each type/channel preference, upsert the record
        if (dto.channelPreferences) {
            for (const [channel, enabled] of Object.entries(dto.channelPreferences)) {
                for (const type of Object.values(NotificationType)) {
                    await this.supabaseService
                        .getAdminClient()
                        .from('notification_preferences')
                        .upsert({
                            user_id: userId,
                            notification_type: type,
                            channel: channel,
                            is_enabled: enabled,
                        }, {
                            onConflict: 'user_id,notification_type,channel',
                        });
                }
            }
        }

        if (dto.typePreferences) {
            // Apply type-specific preferences across all channels
            for (const [type, enabled] of Object.entries(dto.typePreferences)) {
                for (const channel of Object.values(NotificationChannel)) {
                    await this.supabaseService
                        .getAdminClient()
                        .from('notification_preferences')
                        .upsert({
                            user_id: userId,
                            notification_type: type,
                            channel: channel,
                            is_enabled: enabled,
                        }, {
                            onConflict: 'user_id,notification_type,channel',
                        });
                }
            }
        }

        return this.getPreferences(userId);
    }

    // ========================================================================
    // CREATE NOTIFICATION (Internal)
    // ========================================================================

    /**
     * Create a notification for a user
     * This is typically called by other services
     */
    async createNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        options: {
            actionUrl?: string;
            resourceType?: string;
            resourceId?: string;
            metadata?: Record<string, any>;
        } = {},
    ): Promise<string | null> {
        try {
            const { data, error } = await this.supabaseService
                .getAdminClient()
                .rpc('create_notification', {
                    p_user_id: userId,
                    p_type: type,
                    p_title: title,
                    p_message: message,
                    p_resource_type: options.resourceType || null,
                    p_resource_id: options.resourceId || null,
                });

            if (error) {
                this.logger.error(`Failed to create notification: ${error.message}`);
                return null;
            }

            return data;
        } catch (error) {
            this.logger.error(`Notification creation error: ${error.message}`);
            return null;
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    private mapToNotificationDto(n: any): NotificationDto {
        return {
            id: n.id,
            type: n.notification_type,
            title: n.title,
            message: n.message,
            isRead: n.is_read,
            isArchived: n.is_archived,
            actionUrl: n.action_url,
            resourceType: n.resource_type,
            resourceId: n.resource_id,
            metadata: n.metadata,
            createdAt: n.created_at,
        };
    }
}
