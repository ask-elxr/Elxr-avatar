# Overview

This is a full-stack web application that integrates HeyGen's AI streaming avatar technology to create an interactive chat experience. The application features a React-based frontend with a Node.js/Express backend, allowing users to have real-time conversations with AI-powered avatars through video streaming and text messaging.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Single-page application built with React 18 and TypeScript for type safety
- **Vite Build System**: Modern build tool for fast development and optimized production builds
- **Component Design**: Uses shadcn/ui component library built on Radix UI primitives for consistent, accessible UI components
- **Styling**: Tailwind CSS with CSS custom properties for theming and responsive design
- **State Management**: TanStack Query for server state management and React hooks for local state
- **Routing**: Wouter for lightweight client-side routing

## Backend Architecture
- **Express.js Server**: RESTful API server with middleware for JSON parsing and request logging
- **Database Layer**: Drizzle ORM configured for PostgreSQL with schema definitions and migrations
- **Storage Abstraction**: Pluggable storage interface with in-memory implementation for development
- **Environment-based Configuration**: Separate development and production modes with environment variable support

## Data Storage
- **Primary Database**: PostgreSQL via Neon Database service for production data persistence
- **ORM**: Drizzle ORM for type-safe database operations and schema management
- **Session Storage**: PostgreSQL-based session storage using connect-pg-simple
- **Schema Design**: User management with UUID primary keys and unique constraints

## Authentication & Authorization
- **Session-based Authentication**: Server-side sessions stored in PostgreSQL
- **User Management**: Username/password authentication with secure password storage
- **API Security**: Credential-based requests with CORS handling

## External Dependencies

### Core Services
- **HeyGen Streaming Avatar API**: Primary AI avatar service for real-time video streaming and conversation
- **Neon Database**: Managed PostgreSQL hosting for production data storage

### Frontend Libraries
- **UI Framework**: React 18 with TypeScript support
- **Component Library**: Radix UI primitives with shadcn/ui customizations
- **Styling**: Tailwind CSS with autoprefixer and PostCSS
- **State Management**: TanStack React Query for server state
- **Routing**: Wouter for lightweight client-side navigation
- **Form Handling**: React Hook Form with Zod validation
- **Icons**: Lucide React icon library

### Backend Dependencies
- **Server Framework**: Express.js with TypeScript
- **Database**: Drizzle ORM with PostgreSQL driver
- **Session Management**: express-session with PostgreSQL store
- **Development Tools**: tsx for TypeScript execution, esbuild for production builds

### Development Tools
- **Build System**: Vite with React plugin and runtime error overlay
- **Type Checking**: TypeScript with strict mode enabled
- **Database Migrations**: Drizzle Kit for schema management
- **Environment Management**: dotenv for configuration management