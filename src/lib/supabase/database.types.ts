export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          payload: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: number
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          end_date: string | null
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes: string | null
          pax: number
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["booking_status"]
          stay_id: string | null
          total_cents: number
          tour_id: string | null
          transfer_route_id: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          pax?: number
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stay_id?: string | null
          total_cents: number
          tour_id?: string | null
          transfer_route_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          pax?: number
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stay_id?: string | null
          total_cents?: number
          tour_id?: string | null
          transfer_route_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_transfer_route_id_fkey"
            columns: ["transfer_route_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes: string | null
          pax: number
          start_date: string | null
          stay_id: string | null
          tour_id: string | null
          transfer_route_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          item_type: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          pax?: number
          start_date?: string | null
          stay_id?: string | null
          tour_id?: string | null
          transfer_route_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          notes?: string | null
          pax?: number
          start_date?: string | null
          stay_id?: string | null
          tour_id?: string | null
          transfer_route_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_transfer_route_id_fkey"
            columns: ["transfer_route_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cart_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          replied_at: string | null
          replied_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contact_messages_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_cents: number
          booking_id: string | null
          coupon_id: string
          discount_cents: number
          id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          coupon_id: string
          discount_cents: number
          id?: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          coupon_id?: string
          discount_cents?: number
          id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coupon_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_en: string | null
          description_es: string | null
          discount_pct: number
          expires_at: string | null
          id: string
          max_uses: number | null
          updated_at: string
          used_count: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_en?: string | null
          description_es?: string | null
          discount_pct: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_en?: string | null
          description_es?: string | null
          discount_pct?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          updated_at?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "coupons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_role_permissions: {
        Row: {
          granted_at: string
          permission_key: string
          role_id: string
        }
        Insert: {
          granted_at?: string
          permission_key: string
          role_id: string
        }
        Update: {
          granted_at?: string
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "custom_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          label_en: string
          label_es: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          label_en: string
          label_es: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          label_en?: string
          label_es?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          deleted_at: string | null
          email: string | null
          emergency_phone: string | null
          id: string
          license: string | null
          name: string
          phone: string | null
          rating: number
          status: string
          trips_count: number
          updated_at: string
          vehicle: string | null
          web_visible: boolean
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          emergency_phone?: string | null
          id?: string
          license?: string | null
          name: string
          phone?: string | null
          rating?: number
          status?: string
          trips_count?: number
          updated_at?: string
          vehicle?: string | null
          web_visible?: boolean
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          emergency_phone?: string | null
          id?: string
          license?: string | null
          name?: string
          phone?: string | null
          rating?: number
          status?: string
          trips_count?: number
          updated_at?: string
          vehicle?: string | null
          web_visible?: boolean
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          booking_id: string | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total_cents: number
          quantity: number
          stay_id: string | null
          tour_id: string | null
          transfer_route_id: string | null
          unit_cents: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total_cents: number
          quantity?: number
          stay_id?: string | null
          tour_id?: string | null
          transfer_route_id?: string | null
          unit_cents: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total_cents?: number
          quantity?: number
          stay_id?: string | null
          tour_id?: string | null
          transfer_route_id?: string | null
          unit_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_stay_id_fkey"
            columns: ["stay_id"]
            isOneToOne: false
            referencedRelation: "stays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_transfer_route_id_fkey"
            columns: ["transfer_route_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_whatsapp: string | null
          discount_cents: number
          due_at: string | null
          id: string
          issued_at: string
          notes: string | null
          number: string
          paid_at: string | null
          payment_ref: string | null
          pdf_url: string | null
          rated_at: string | null
          rating: number | null
          status: string
          stripe_payment_link_id: string | null
          stripe_payment_link_url: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_whatsapp?: string | null
          discount_cents?: number
          due_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          number: string
          paid_at?: string | null
          payment_ref?: string | null
          pdf_url?: string | null
          rated_at?: string | null
          rating?: number | null
          status?: string
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal_cents: number
          tax_cents?: number
          total_cents: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_whatsapp?: string | null
          discount_cents?: number
          due_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          number?: string
          paid_at?: string | null
          payment_ref?: string | null
          pdf_url?: string | null
          rated_at?: string | null
          rating?: number | null
          status?: string
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body_en: string | null
          body_es: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          recipient_id: string
          title_en: string
          title_es: string
        }
        Insert: {
          body_en?: string | null
          body_es?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          recipient_id: string
          title_en: string
          title_es: string
        }
        Update: {
          body_en?: string | null
          body_es?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          recipient_id?: string
          title_en?: string
          title_es?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_referrals: {
        Row: {
          id: string
          ip: unknown
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          partner_id: string
          redirected_at: string
          referrer: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          ip?: unknown
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          partner_id: string
          redirected_at?: string
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          ip?: unknown
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          partner_id?: string
          redirected_at?: string
          referrer?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "partner_referrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          affiliate_code: string | null
          base_url: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          logo: string | null
          name: string
          notes_en: string | null
          notes_es: string | null
          slug: string
          updated_at: string
          utm_source: string
        }
        Insert: {
          active?: boolean
          affiliate_code?: string | null
          base_url: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo?: string | null
          name: string
          notes_en?: string | null
          notes_es?: string | null
          slug: string
          updated_at?: string
          utm_source?: string
        }
        Update: {
          active?: boolean
          affiliate_code?: string | null
          base_url?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo?: string | null
          name?: string
          notes_en?: string | null
          notes_es?: string | null
          slug?: string
          updated_at?: string
          utm_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "partners_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_configs: {
        Row: {
          account_email: string | null
          client_id: string | null
          client_secret: string | null
          configured_at: string | null
          configured_by: string | null
          connected_account_id: string | null
          default_currency: string | null
          enabled: boolean
          mode: string
          provider: string
          publishable_key: string | null
          secret_key: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          account_email?: string | null
          client_id?: string | null
          client_secret?: string | null
          configured_at?: string | null
          configured_by?: string | null
          connected_account_id?: string | null
          default_currency?: string | null
          enabled?: boolean
          mode?: string
          provider: string
          publishable_key?: string | null
          secret_key?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          account_email?: string | null
          client_id?: string | null
          client_secret?: string | null
          configured_at?: string | null
          configured_by?: string | null
          connected_account_id?: string | null
          default_currency?: string | null
          enabled?: boolean
          mode?: string
          provider?: string
          publishable_key?: string | null
          secret_key?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_configs_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payment_provider_configs_configured_by_fkey"
            columns: ["configured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          booking_id: string
          claimed_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          external_ref: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          receipt_url: string | null
          rejected_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          claimed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          claimed_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          receipt_url?: string | null
          rejected_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          area: string
          created_at: string
          description_en: string
          description_es: string
          key: string
          label_en: string
          label_es: string
        }
        Insert: {
          area: string
          created_at?: string
          description_en: string
          description_es: string
          key: string
          label_en: string
          label_es: string
        }
        Update: {
          area?: string
          created_at?: string
          description_en?: string
          description_es?: string
          key?: string
          label_en?: string
          label_es?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_id: string | null
          body_en: string | null
          body_es: string | null
          category: string | null
          created_at: string
          excerpt_en: string | null
          excerpt_es: string | null
          featured: boolean
          id: string
          image: string | null
          published_at: string | null
          scheduled_at: string | null
          slug: string
          status: Database["public"]["Enums"]["content_status"]
          tags: Json
          title_en: string | null
          title_es: string
          updated_at: string
          views: number
        }
        Insert: {
          author_id?: string | null
          body_en?: string | null
          body_es?: string | null
          category?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_es?: string | null
          featured?: boolean
          id?: string
          image?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          slug: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: Json
          title_en?: string | null
          title_es: string
          updated_at?: string
          views?: number
        }
        Update: {
          author_id?: string | null
          body_en?: string | null
          body_es?: string | null
          category?: string | null
          created_at?: string
          excerpt_en?: string | null
          excerpt_es?: string | null
          featured?: boolean
          id?: string
          image?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["content_status"]
          tags?: Json
          title_en?: string | null
          title_es?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          country: string | null
          created_at: string
          custom_role_id: string | null
          deleted_at: string | null
          department: string | null
          employee_id: string | null
          first_name: string | null
          id: string
          lang_pref: Database["public"]["Enums"]["language_code"]
          last_name: string | null
          notification_prefs: Json
          phone: string | null
          points_balance: number
          points_spent: number
          position: string | null
          provider: string
          provider_sub: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          tfa_enabled: boolean
          tier: Database["public"]["Enums"]["loyalty_tier"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          country?: string | null
          created_at?: string
          custom_role_id?: string | null
          deleted_at?: string | null
          department?: string | null
          employee_id?: string | null
          first_name?: string | null
          id: string
          lang_pref?: Database["public"]["Enums"]["language_code"]
          last_name?: string | null
          notification_prefs?: Json
          phone?: string | null
          points_balance?: number
          points_spent?: number
          position?: string | null
          provider?: string
          provider_sub?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tfa_enabled?: boolean
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          country?: string | null
          created_at?: string
          custom_role_id?: string | null
          deleted_at?: string | null
          department?: string | null
          employee_id?: string | null
          first_name?: string | null
          id?: string
          lang_pref?: Database["public"]["Enums"]["language_code"]
          last_name?: string | null
          notification_prefs?: Json
          phone?: string | null
          points_balance?: number
          points_spent?: number
          position?: string | null
          provider?: string
          provider_sub?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          tfa_enabled?: boolean
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body: string | null
          created_at: string
          id: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating: number
          status: Database["public"]["Enums"]["content_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          created_at?: string
          id?: string
          item_id: string
          item_type: Database["public"]["Enums"]["item_type"]
          rating: number
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          rating?: number
          status?: Database["public"]["Enums"]["content_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stays: {
        Row: {
          active: boolean
          amenities: Json
          bathrooms: number
          bedrooms: number
          cancellation_policy: string | null
          category: string | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          created_by: string | null
          description_en: string | null
          description_es: string | null
          featured: boolean
          house_rules: string | null
          id: string
          images: Json
          lat: number | null
          lng: number | null
          location: string | null
          markup_type: string | null
          markup_value: number | null
          max_guests: number
          partner_id: string | null
          partner_url: string | null
          price_cents: number
          pricing_extras: Json
          pricing_unit: string | null
          rating_avg: number
          rating_count: number
          short_desc_en: string | null
          short_desc_es: string | null
          slug: string
          title_en: string | null
          title_es: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amenities?: Json
          bathrooms?: number
          bedrooms?: number
          cancellation_policy?: string | null
          category?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          featured?: boolean
          house_rules?: string | null
          id?: string
          images?: Json
          lat?: number | null
          lng?: number | null
          location?: string | null
          markup_type?: string | null
          markup_value?: number | null
          max_guests?: number
          partner_id?: string | null
          partner_url?: string | null
          price_cents: number
          pricing_extras?: Json
          pricing_unit?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc_en?: string | null
          short_desc_es?: string | null
          slug: string
          title_en?: string | null
          title_es: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amenities?: Json
          bathrooms?: number
          bedrooms?: number
          cancellation_policy?: string | null
          category?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          featured?: boolean
          house_rules?: string | null
          id?: string
          images?: Json
          lat?: number | null
          lng?: number | null
          location?: string | null
          markup_type?: string | null
          markup_value?: number | null
          max_guests?: number
          partner_id?: string | null
          partner_url?: string | null
          price_cents?: number
          pricing_extras?: Json
          pricing_unit?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc_en?: string | null
          short_desc_es?: string | null
          slug?: string
          title_en?: string | null
          title_es?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stays_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string | null
          description_en: string | null
          description_es: string | null
          difficulty: string | null
          duration_minutes: number
          featured: boolean
          id: string
          images: Json
          includes: Json
          lat: number | null
          lng: number | null
          location: string | null
          markup_type: string | null
          markup_value: number | null
          max_pax: number
          meeting_point: string | null
          partner_id: string | null
          partner_url: string | null
          price_cents: number
          pricing_extras: Json
          pricing_unit: string | null
          rating_avg: number
          rating_count: number
          short_desc_en: string | null
          short_desc_es: string | null
          slug: string
          title_en: string | null
          title_es: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          difficulty?: string | null
          duration_minutes: number
          featured?: boolean
          id?: string
          images?: Json
          includes?: Json
          lat?: number | null
          lng?: number | null
          location?: string | null
          markup_type?: string | null
          markup_value?: number | null
          max_pax?: number
          meeting_point?: string | null
          partner_id?: string | null
          partner_url?: string | null
          price_cents: number
          pricing_extras?: Json
          pricing_unit?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc_en?: string | null
          short_desc_es?: string | null
          slug: string
          title_en?: string | null
          title_es: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          description_en?: string | null
          description_es?: string | null
          difficulty?: string | null
          duration_minutes?: number
          featured?: boolean
          id?: string
          images?: Json
          includes?: Json
          lat?: number | null
          lng?: number | null
          location?: string | null
          markup_type?: string | null
          markup_value?: number | null
          max_pax?: number
          meeting_point?: string | null
          partner_id?: string | null
          partner_url?: string | null
          price_cents?: number
          pricing_extras?: Json
          pricing_unit?: string | null
          rating_avg?: number
          rating_count?: number
          short_desc_en?: string | null
          short_desc_es?: string | null
          slug?: string
          title_en?: string | null
          title_es?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_booking_legs: {
        Row: {
          bags: number
          booking_id: string
          created_at: string
          from_point: string
          id: string
          leg_order: number
          notes: string | null
          pax: number
          price_cents: number
          route_template_id: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          to_point: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          bags?: number
          booking_id: string
          created_at?: string
          from_point: string
          id?: string
          leg_order?: number
          notes?: string | null
          pax?: number
          price_cents?: number
          route_template_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          to_point: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          bags?: number
          booking_id?: string
          created_at?: string
          from_point?: string
          id?: string
          leg_order?: number
          notes?: string | null
          pax?: number
          price_cents?: number
          route_template_id?: string | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          to_point?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_booking_legs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_booking_legs_route_template_id_fkey"
            columns: ["route_template_id"]
            isOneToOne: false
            referencedRelation: "transfer_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_booking_legs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label_en: string
          label_es: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label_en: string
          label_es: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label_en?: string
          label_es?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      transfer_routes: {
        Row: {
          active: boolean
          base_price_cents: number
          created_at: string
          distance_km: number | null
          duration_minutes: number | null
          featured: boolean
          from_location: string
          id: string
          max_pax: number
          pricing_unit: string | null
          to_location: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          base_price_cents: number
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          featured?: boolean
          from_location: string
          id?: string
          max_pax?: number
          pricing_unit?: string | null
          to_location: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          base_price_cents?: number
          created_at?: string
          distance_km?: number | null
          duration_minutes?: number | null
          featured?: boolean
          from_location?: string
          id?: string
          max_pax?: number
          pricing_unit?: string | null
          to_location?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission_key: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission_key: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image: string | null
          max_luggage: number
          max_pax: number
          name: string
          price_cents: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image?: string | null
          max_luggage?: number
          max_pax?: number
          name: string
          price_cents?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image?: string | null
          max_luggage?: number
          max_pax?: number
          name?: string
          price_cents?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      customer_stats: {
        Row: {
          invoices_paid: number | null
          most_frequent_service_type: string | null
          service_count: number | null
          total_invested_cents: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      fn_has_permission: { Args: { perm_key: string }; Returns: boolean }
      fn_is_admin: { Args: never; Returns: boolean }
      fn_is_staff: { Args: never; Returns: boolean }
      fn_tier_from_points: {
        Args: { points: number }
        Returns: Database["public"]["Enums"]["loyalty_tier"]
      }
    }
    Enums: {
      booking_status:
        | "pending"
        | "pending_payment"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "refunded"
      content_status: "draft" | "scheduled" | "published" | "archived"
      item_type: "stay" | "tour" | "transfer"
      language_code: "es" | "en"
      loyalty_tier: "bronze" | "silver" | "gold"
      payment_method: "stripe" | "paypal" | "ath" | "bank"
      payment_status:
        | "pending"
        | "claimed"
        | "confirmed"
        | "rejected"
        | "refunded"
      user_role: "admin" | "user"
      user_status: "active" | "inactive"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: [
        "pending",
        "pending_payment",
        "confirmed",
        "cancelled",
        "completed",
        "refunded",
      ],
      content_status: ["draft", "scheduled", "published", "archived"],
      item_type: ["stay", "tour", "transfer"],
      language_code: ["es", "en"],
      loyalty_tier: ["bronze", "silver", "gold"],
      payment_method: ["stripe", "paypal", "ath", "bank"],
      payment_status: [
        "pending",
        "claimed",
        "confirmed",
        "rejected",
        "refunded",
      ],
      user_role: ["admin", "user"],
      user_status: ["active", "inactive"],
    },
  },
} as const
