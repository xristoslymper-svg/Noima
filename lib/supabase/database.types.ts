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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_type: Database["public"]["Enums"]["session_type"]
          clinician_id: string
          created_at: string
          created_by: string
          id: string
          patient_id: string
          practice_id: string
          scheduled_end: string
          scheduled_start: string
          session_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_type: Database["public"]["Enums"]["session_type"]
          clinician_id: string
          created_at?: string
          created_by?: string
          id?: string
          patient_id: string
          practice_id: string
          scheduled_end: string
          scheduled_start: string
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_type?: Database["public"]["Enums"]["session_type"]
          clinician_id?: string
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          practice_id?: string
          scheduled_end?: string
          scheduled_start?: string
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "appointments_practice_id_clinician_id_fkey"
            columns: ["practice_id", "clinician_id"]
            isOneToOne: false
            referencedRelation: "practice_members"
            referencedColumns: ["practice_id", "user_id"]
          },
          {
            foreignKeyName: "appointments_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          patient_id: string | null
          practice_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          patient_id?: string | null
          practice_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          patient_id?: string | null
          practice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "audit_events_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_inputs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          origin: string
          patient_id: string
          practice_id: string
          section_type: Database["public"]["Enums"]["section_type"] | null
          session_id: string
          transcript: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          origin: string
          patient_id: string
          practice_id: string
          section_type?: Database["public"]["Enums"]["section_type"] | null
          session_id: string
          transcript: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          origin?: string
          patient_id?: string
          practice_id?: string
          section_type?: Database["public"]["Enums"]["section_type"] | null
          session_id?: string
          transcript?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_inputs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_inputs_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      clinical_proposals: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          input_id: string
          model_version: string | null
          patient_id: string
          practice_id: string
          provider: string
          section_type: Database["public"]["Enums"]["section_type"]
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string
          id?: string
          input_id: string
          model_version?: string | null
          patient_id: string
          practice_id: string
          provider: string
          section_type: Database["public"]["Enums"]["section_type"]
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          input_id?: string
          model_version?: string | null
          patient_id?: string
          practice_id?: string
          provider?: string
          section_type?: Database["public"]["Enums"]["section_type"]
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_proposals_input_id_session_id_patient_id_practice_fkey"
            columns: ["input_id", "session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_inputs"
            referencedColumns: ["id", "session_id", "patient_id", "practice_id"]
          },
        ]
      }
      clinical_sessions: {
        Row: {
          clinician_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          patient_id: string
          practice_id: string
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          version: number
        }
        Insert: {
          clinician_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          patient_id: string
          practice_id: string
          scheduled_at: string
          session_type: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          clinician_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          patient_id?: string
          practice_id?: string
          scheduled_at?: string
          session_type?: Database["public"]["Enums"]["session_type"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clinical_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_sessions_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "clinical_sessions_practice_id_clinician_id_fkey"
            columns: ["practice_id", "clinician_id"]
            isOneToOne: false
            referencedRelation: "practice_members"
            referencedColumns: ["practice_id", "user_id"]
          },
        ]
      }
      medication_events: {
        Row: {
          actor_user_id: string | null
          effective_on: string
          event_type: string
          id: string
          medication_id: string
          new_state: Json
          occurred_at: string
          patient_id: string
          practice_id: string
          previous_state: Json | null
        }
        Insert: {
          actor_user_id?: string | null
          effective_on: string
          event_type: string
          id?: string
          medication_id: string
          new_state: Json
          occurred_at?: string
          patient_id: string
          practice_id: string
          previous_state?: Json | null
        }
        Update: {
          actor_user_id?: string | null
          effective_on?: string
          event_type?: string
          id?: string
          medication_id?: string
          new_state?: Json
          occurred_at?: string
          patient_id?: string
          practice_id?: string
          previous_state?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_events_medication_id_patient_id_practice_id_fkey"
            columns: ["medication_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patient_medications"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      medication_side_effects: {
        Row: {
          created_at: string
          created_by: string
          description: string
          id: string
          impact: string | null
          medication_id: string | null
          patient_id: string
          practice_id: string
          reported_at: string
          session_id: string | null
          severity: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          description: string
          id?: string
          impact?: string | null
          medication_id?: string | null
          patient_id: string
          practice_id: string
          reported_at?: string
          session_id?: string | null
          severity?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          impact?: string | null
          medication_id?: string | null
          patient_id?: string
          practice_id?: string
          reported_at?: string
          session_id?: string | null
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medication_side_effects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_side_effects_medication_id_patient_id_practice__fkey"
            columns: ["medication_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patient_medications"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
          {
            foreignKeyName: "medication_side_effects_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "medication_side_effects_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      patient_diagnoses: {
        Row: {
          created_at: string
          created_by: string
          diagnosed_at: string
          diagnosis_code: string | null
          diagnosis_system: string | null
          diagnosis_text: string
          id: string
          patient_id: string
          practice_id: string
          session_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          diagnosed_at?: string
          diagnosis_code?: string | null
          diagnosis_system?: string | null
          diagnosis_text: string
          id?: string
          patient_id: string
          practice_id: string
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          diagnosed_at?: string
          diagnosis_code?: string | null
          diagnosis_system?: string | null
          diagnosis_text?: string
          id?: string
          patient_id?: string
          practice_id?: string
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_diagnoses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_diagnoses_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "patient_diagnoses_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      patient_history: {
        Row: {
          chief_complaint: string | null
          created_at: string
          created_by: string
          family_history: string | null
          id: string
          medical_history: string | null
          patient_id: string
          practice_id: string
          protective_factors: string | null
          psychiatric_history: string | null
          social_functioning: string | null
          substance_history: string | null
          updated_at: string
        }
        Insert: {
          chief_complaint?: string | null
          created_at?: string
          created_by?: string
          family_history?: string | null
          id?: string
          medical_history?: string | null
          patient_id: string
          practice_id: string
          protective_factors?: string | null
          psychiatric_history?: string | null
          social_functioning?: string | null
          substance_history?: string | null
          updated_at?: string
        }
        Update: {
          chief_complaint?: string | null
          created_at?: string
          created_by?: string
          family_history?: string | null
          id?: string
          medical_history?: string | null
          patient_id?: string
          practice_id?: string
          protective_factors?: string | null
          psychiatric_history?: string | null
          social_functioning?: string | null
          substance_history?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_history_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
        ]
      }
      patient_medications: {
        Row: {
          created_at: string
          created_by: string
          dose: number
          effective_from: string
          ended_at: string | null
          frequency: string
          id: string
          medication_name: string
          notes: string | null
          patient_id: string
          practice_id: string
          route: string | null
          started_at: string
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          dose: number
          effective_from?: string
          ended_at?: string | null
          frequency: string
          id?: string
          medication_name: string
          notes?: string | null
          patient_id: string
          practice_id: string
          route?: string | null
          started_at: string
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dose?: number
          effective_from?: string
          ended_at?: string | null
          frequency?: string
          id?: string
          medication_name?: string
          notes?: string | null
          patient_id?: string
          practice_id?: string
          route?: string | null
          started_at?: string
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medications_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
        ]
      }
      patient_summary: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string
          id: string
          patient_id: string
          practice_id: string
          source_version: string
          summary_text: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          patient_id: string
          practice_id: string
          source_version: string
          summary_text: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string
          id?: string
          patient_id?: string
          practice_id?: string
          source_version?: string
          summary_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_summary_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_summary_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
        ]
      }
      patients: {
        Row: {
          age_reported_at: string | null
          created_at: string
          created_by: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          phone: string | null
          practice_id: string
          reported_age: number | null
          status: Database["public"]["Enums"]["patient_status"]
          updated_at: string
        }
        Insert: {
          age_reported_at?: string | null
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string
          phone?: string | null
          practice_id: string
          reported_age?: number | null
          status?: Database["public"]["Enums"]["patient_status"]
          updated_at?: string
        }
        Update: {
          age_reported_at?: string | null
          created_at?: string
          created_by?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          practice_id?: string
          reported_age?: number | null
          status?: Database["public"]["Enums"]["patient_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_members: {
        Row: {
          created_at: string
          practice_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          practice_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          practice_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_members_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          created_at: string
          id: string
          is_demo: boolean
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_demo?: boolean
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          professional_title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          professional_title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          professional_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      psychometric_assessments: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          delivery_method: string
          id: string
          instrument_id: string
          interpretation: string | null
          patient_id: string
          practice_id: string
          result_source: string
          sent_at: string | null
          session_id: string | null
          status: string
          total_score: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          delivery_method: string
          id?: string
          instrument_id: string
          interpretation?: string | null
          patient_id: string
          practice_id: string
          result_source?: string
          sent_at?: string | null
          session_id?: string | null
          status?: string
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          delivery_method?: string
          id?: string
          instrument_id?: string
          interpretation?: string | null
          patient_id?: string
          practice_id?: string
          result_source?: string
          sent_at?: string | null
          session_id?: string | null
          status?: string
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "psychometric_assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psychometric_assessments_instrument_id_fkey"
            columns: ["instrument_id"]
            isOneToOne: false
            referencedRelation: "psychometric_instruments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psychometric_assessments_patient_id_practice_id_fkey"
            columns: ["patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "practice_id"]
          },
          {
            foreignKeyName: "psychometric_assessments_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      psychometric_instruments: {
        Row: {
          active: boolean
          code: string
          definition: Json | null
          description: string | null
          id: string
          name: string
          version: string
        }
        Insert: {
          active?: boolean
          code: string
          definition?: Json | null
          description?: string | null
          id?: string
          name: string
          version: string
        }
        Update: {
          active?: boolean
          code?: string
          definition?: Json | null
          description?: string | null
          id?: string
          name?: string
          version?: string
        }
        Relationships: []
      }
      psychometric_responses: {
        Row: {
          assessment_id: string
          created_at: string
          created_by: string | null
          id: string
          item_key: string
          patient_id: string
          practice_id: string
          response_value: Json
          score: number | null
        }
        Insert: {
          assessment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_key: string
          patient_id: string
          practice_id: string
          response_value: Json
          score?: number | null
        }
        Update: {
          assessment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_key?: string
          patient_id?: string
          practice_id?: string
          response_value?: Json
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "psychometric_responses_assessment_id_patient_id_practice_i_fkey"
            columns: ["assessment_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "psychometric_assessments"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
          {
            foreignKeyName: "psychometric_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string
          attempt_history: boolean | null
          clinical_note: string | null
          created_at: string
          created_by: string
          id: string
          intent: boolean | null
          patient_id: string
          plan: boolean | null
          practice_id: string
          protective_factors: string | null
          self_harm: boolean | null
          session_id: string
          suicidal_ideation: boolean | null
          updated_at: string
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string
          attempt_history?: boolean | null
          clinical_note?: string | null
          created_at?: string
          created_by?: string
          id?: string
          intent?: boolean | null
          patient_id: string
          plan?: boolean | null
          practice_id: string
          protective_factors?: string | null
          self_harm?: boolean | null
          session_id: string
          suicidal_ideation?: boolean | null
          updated_at?: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string
          attempt_history?: boolean | null
          clinical_note?: string | null
          created_at?: string
          created_by?: string
          id?: string
          intent?: boolean | null
          patient_id?: string
          plan?: boolean | null
          practice_id?: string
          protective_factors?: string | null
          self_harm?: boolean | null
          session_id?: string
          suicidal_ideation?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_assessments_assessed_by_fkey"
            columns: ["assessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_assessments_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
      session_sections: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          input_id: string | null
          patient_id: string
          practice_id: string
          proposal_id: string | null
          section_type: Database["public"]["Enums"]["section_type"]
          session_id: string
          source: Database["public"]["Enums"]["content_source"]
          status: Database["public"]["Enums"]["section_status"]
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          created_by?: string
          id?: string
          input_id?: string | null
          patient_id: string
          practice_id: string
          proposal_id?: string | null
          section_type: Database["public"]["Enums"]["section_type"]
          session_id: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["section_status"]
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          input_id?: string | null
          patient_id?: string
          practice_id?: string
          proposal_id?: string | null
          section_type?: Database["public"]["Enums"]["section_type"]
          session_id?: string
          source?: Database["public"]["Enums"]["content_source"]
          status?: Database["public"]["Enums"]["section_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "session_sections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_sections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_sections_input_id_session_id_patient_id_practice_i_fkey"
            columns: ["input_id", "session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_inputs"
            referencedColumns: ["id", "session_id", "patient_id", "practice_id"]
          },
          {
            foreignKeyName: "session_sections_proposal_id_session_id_patient_id_practic_fkey"
            columns: [
              "proposal_id",
              "session_id",
              "patient_id",
              "practice_id",
              "section_type",
            ]
            isOneToOne: false
            referencedRelation: "clinical_proposals"
            referencedColumns: [
              "id",
              "session_id",
              "patient_id",
              "practice_id",
              "section_type",
            ]
          },
          {
            foreignKeyName: "session_sections_session_id_patient_id_practice_id_fkey"
            columns: ["session_id", "patient_id", "practice_id"]
            isOneToOne: false
            referencedRelation: "clinical_sessions"
            referencedColumns: ["id", "patient_id", "practice_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_clinical_section: {
        Args: { expected_version: number; section_id: string }
        Returns: undefined
      }
      complete_clinical_session: {
        Args: { expected_version: number; session_id: string }
        Returns: undefined
      }
    }
    Enums: {
      content_source: "manual" | "dictation" | "ai_proposal"
      patient_status: "active" | "inactive"
      section_status: "draft" | "approved"
      section_type:
        | "psychiatric_interview"
        | "symptoms"
        | "side_effects"
        | "medication_adherence"
        | "mse"
        | "risk_assessment"
        | "clinical_assessment"
        | "treatment_plan"
        | "next_review"
      session_status: "draft" | "completed"
      session_type: "initial_assessment" | "follow_up"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      content_source: ["manual", "dictation", "ai_proposal"],
      patient_status: ["active", "inactive"],
      section_status: ["draft", "approved"],
      section_type: [
        "psychiatric_interview",
        "symptoms",
        "side_effects",
        "medication_adherence",
        "mse",
        "risk_assessment",
        "clinical_assessment",
        "treatment_plan",
        "next_review",
      ],
      session_status: ["draft", "completed"],
      session_type: ["initial_assessment", "follow_up"],
    },
  },
} as const

