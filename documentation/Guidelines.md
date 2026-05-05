# ExoDuZe — Development Guidelines

> **Engineering Standards & Best Practices**  
> Version 2.0.0 | Published: January 8, 2026  
> Target Audience: Software Engineers, Code Reviewers

---

## Document Purpose

This document establishes coding standards, architectural patterns, and development workflows for the ExoDuZe project. All contributors must follow these guidelines to ensure code quality, security, and maintainability.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Code Standards](#2-code-standards)
3. [Frontend Development](#3-frontend-development)
4. [Backend Development](#4-backend-development)
5. [Database Guidelines](#5-database-guidelines)
6. [Security Guidelines](#6-security-guidelines)
7. [Testing Standards](#7-testing-standards)
8. [API Design](#8-api-design)
9. [Git Workflow](#9-git-workflow)
10. [Code Review Checklist](#10-code-review-checklist)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Getting Started

### 1.1 Prerequisites

| Requirement | Version | Installation |
|-------------|---------|--------------|
| Node.js | ≥ 20.x LTS | [nodejs.org](https://nodejs.org) |
| PNPM | ≥ 9.0 | `npm install -g pnpm` |
| Git | ≥ 2.40 | [git-scm.com](https://git-scm.com) |
| VS Code | Latest | [code.visualstudio.com](https://code.visualstudio.com) |

### 1.2 Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-azuretools.vscode-docker"
  ]
}
```

### 1.3 Project Setup

```bash
# 1. Clone repository
git clone https://github.com/siabang35/exoduze.git
cd exoduze

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp apps/api/.env.template apps/api/.env
cp apps/web/.env.template apps/web/.env

# 4. Start development
pnpm dev
```

### 1.4 Development URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:3001 |
| Swagger | http://localhost:3001/api/docs |

---

## 2. Code Standards

### 2.1 TypeScript Configuration

All code must be TypeScript with strict mode enabled.

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### 2.2 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `UserProfile.tsx` |
| Files (utilities) | kebab-case | `format-date.ts` |
| Classes | PascalCase | `UserService` |
| Interfaces/Types | PascalCase | `UserDto` |
| Functions | camelCase | `getUserById()` |
| Constants | SCREAMING_SNAKE | `MAX_RETRY_COUNT` |
| Enum Values | SCREAMING_SNAKE | `OrderStatus.PENDING` |

### 2.3 Import Order

```typescript
// 1. Node.js built-ins
import { createHash } from 'crypto';

// 2. External packages
import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

// 3. Internal packages (@exoduze/*)
import { User } from '@exoduze/domain';

// 4. Relative imports
import { UsersService } from './users.service.js';
import { UserDto } from './dto/index.js';
```

### 2.4 File Structure

```typescript
// 1. Imports

// 2. Types/Interfaces

// 3. Constants

// 4. Main export (class/function)

// 5. Helper functions (if not in separate file)
```

---

## 3. Frontend Development

### 3.1 Component Structure

```
components/
└── UserProfile/
    ├── UserProfile.tsx       # Main component (Matches folder name)
    ├── UserProfile.test.tsx  # Tests
    ├── UserProfile.module.css # Styles (if not Tailwind)
    └── index.ts              # Barrel export ONLY (No implementation)
    
// ❌ Avoid:
// components/UserProfile/index.tsx (Harder to debug in tabs)
```

### 3.2 Component Template

```tsx
import { useState, useCallback, memo } from 'react';

// Types
interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

// Component
export const UserProfile = memo(function UserProfile({
  userId,
  onUpdate,
}: UserProfileProps) {
  // State
  const [isLoading, setIsLoading] = useState(false);
  
  // Handlers
  const handleUpdate = useCallback(() => {
    // ...
  }, []);

  // Render
  if (isLoading) return <Spinner />;

  return (
    <div className="user-profile">
      {/* Content */}
    </div>
  );
});

// Default export (optional)
export default UserProfile;
```

### 3.3 Hooks Guidelines

```tsx
// ✅ Custom hook pattern
export function useUser(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    
    async function fetchUser() {
      try {
        setIsLoading(true);
        const data = await api.getUser(userId);
        if (!cancelled) setUser(data);
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchUser();
    return () => { cancelled = true; };
  }, [userId]);

  return { user, isLoading, error };
}
```

### 3.4 Context Guidelines

```tsx
// 1. Create context with type
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// 2. Create hook with error handling
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// 3. Create provider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Implementation
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
```

### 3.5 Styling Guidelines

```tsx
// ✅ Use Tailwind utility classes
<button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark">
  Submit
</button>

// ✅ Use CSS variables for theme
<div style={{ background: 'var(--bg-primary)' }}>

// ❌ Avoid inline styles for static values
<div style={{ padding: 16, marginTop: 8 }}>

// ❌ Avoid magic numbers
<div className="p-[17px] mt-[9px]">
```

---

## 4. Backend Development

### 4.1 Module Structure

```
modules/
└── users/
    ├── dto/
    │   ├── create-user.dto.ts
    │   ├── update-user.dto.ts
    │   └── index.ts
    ├── guards/
    │   └── user-owner.guard.ts
    ├── users.controller.ts
    ├── users.service.ts
    ├── users.module.ts
    └── users.spec.ts
```

### 4.2 DTO Guidelines

```typescript
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  MinLength, 
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ 
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  email: string;

  @ApiProperty({ 
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    { message: 'Password must contain uppercase, lowercase, and number' }
  )
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fullName?: string;
}
```

### 4.3 Service Guidelines

```typescript
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Find user by ID
   * @throws NotFoundException if user not found
   */
  async findById(id: string): Promise<User> {
    this.logger.debug(`Finding user: ${id}`);

    const { data, error } = await this.supabaseService
      .getAdminClient()
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      this.logger.warn(`User not found: ${id}`);
      throw new NotFoundException('User not found');
    }

    return this.mapToUser(data);
  }

  /**
   * Map database row to domain entity
   */
  private mapToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      createdAt: new Date(row.created_at),
    };
  }
}
```

### 4.4 Controller Guidelines

```typescript
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, type: UserDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUser(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<UserDto> {
    // Authorization check
    if (req.user.sub !== id) {
      throw new ForbiddenException('Cannot update other users');
    }
    return this.usersService.update(id, dto);
  }
}
```

### 4.5 Error Handling

```typescript
// ✅ Use NestJS built-in exceptions
throw new NotFoundException('User not found');
throw new BadRequestException('Invalid email format');
throw new ForbiddenException('Insufficient permissions');
throw new ConflictException('Email already exists');

// ✅ Log errors with context
this.logger.error(`Failed to create user: ${error.message}`, error.stack);

// ❌ Avoid generic errors
throw new Error('Something went wrong');
```

---

## 5. Database Guidelines

### 5.1 Migration Naming

```
{sequence}_{description}.sql

Examples:
001_initial_schema.sql
002_add_user_preferences.sql
010_fix_balance_trigger.sql
```

### 5.2 Table Design

```sql
-- ✅ Standard table structure
CREATE TABLE public.users (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Required fields
    email TEXT NOT NULL,
    
    -- Optional fields
    full_name TEXT,
    avatar_url TEXT,
    
    -- Status field with constraint
    status TEXT DEFAULT 'active' 
        CHECK (status IN ('active', 'suspended', 'deleted')),
    
    -- Timestamps (always include)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Constraints
    CONSTRAINT users_email_unique UNIQUE (email)
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create updated_at trigger
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_status ON public.users(status);
```

### 5.3 RLS Policies

```sql
-- Users can read own data
CREATE POLICY "users_read_own"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

-- Users can update own data
CREATE POLICY "users_update_own"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Service role has full access
CREATE POLICY "service_role_all"
    ON public.users FOR ALL
    USING (auth.role() = 'service_role');
```

### 5.4 Query Guidelines

```typescript
// ✅ Always use parameterized queries (Supabase handles this)
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId);

// ✅ Select only needed columns
const { data } = await supabase
  .from('users')
  .select('id, email, full_name');

// ✅ Use pagination
const { data } = await supabase
  .from('users')
  .select('*', { count: 'exact' })
  .range(0, 19);

// ❌ Never interpolate user input
const query = `SELECT * FROM users WHERE id = '${userId}'`; // SQL Injection!
```

---

## 6. Security Guidelines

### 6.1 Input Validation

```typescript
// ✅ MANDATORY: Use validation decorators from src/common/decorators
@Post()
async create(@Body() dto: CreateTransactionDto) {
  // dto is automatically validated
}

export class CreateTransactionDto {
  // ✅ Use @IsSafeNumber for financial values (prevents NaN/Infinity/Overflow)
  @IsSafeNumber()
  amount: number;

  // ✅ Use strict UUID validation
  @IsUUIDv4()
  userId: string;
}
```

### 6.2 Authentication & Real-Time

```typescript
// ✅ Use guards for authentication
@UseGuards(JwtAuthGuard)
@Get('me')
async getMe(@Req() req: AuthenticatedRequest) {
  return req.user;
}

// ✅ MANDATORY: Secure all WebSockets
@WebSocketGateway()
@UseGuards(WsAuthGuard) // <--- Critical for all gateways
export class SportsGateway {}
```

### 6.3 Authorization & Integrity

```typescript
// ✅ MANDATORY: Idempotency for financial actions
@Post('buy')
@UseGuards(IdempotencyGuard) // Checks Idempotency-Key header
async buyShares() {}

// ✅ Check resource ownership
if (req.user.sub !== id) throw new ForbiddenException();
```

### 6.4 Sensitive Data

```typescript
// ✅ Never log sensitive data
this.logger.log(`Login attempt: ${maskEmail(email)}`);

// ✅ Use LoggerMiddleware (it automatically null-checks and masks bodies)
```

### 6.5 Rate Limiting

```typescript
// ✅ Apply global and local limits
@RateLimit(RateLimits.STRICT) // 10 req/min
@Post('auth/login')
async login() {}
```

---

## 7. Testing Standards

### 7.1 Test File Naming

```
component.tsx          → component.test.tsx
service.ts            → service.spec.ts
user.controller.ts    → user.controller.spec.ts
```

### 7.2 Unit Test Template

```typescript
describe('UsersService', () => {
  let service: UsersService;
  let supabaseService: jest.Mocked<SupabaseService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: SupabaseService,
          useValue: {
            getAdminClient: jest.fn().mockReturnValue({
              from: jest.fn().mockReturnThis(),
              select: jest.fn().mockReturnThis(),
              eq: jest.fn().mockReturnThis(),
              single: jest.fn(),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    supabaseService = module.get(SupabaseService);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      // Arrange
      const mockUser = { id: '1', email: 'test@test.com' };
      supabaseService.getAdminClient().single.mockResolvedValue({
        data: mockUser,
        error: null,
      });

      // Act
      const result = await service.findById('1');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        id: '1',
        email: 'test@test.com',
      }));
    });

    it('should throw NotFoundException when not found', async () => {
      // Arrange
      supabaseService.getAdminClient().single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      // Act & Assert
      await expect(service.findById('999'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
```

### 7.3 E2E Test Template

```typescript
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('should return tokens on valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPass123',
        })
        .expect(200)
        .expect(res => {
          expect(res.body.tokens.accessToken).toBeDefined();
          expect(res.body.tokens.refreshToken).toBeDefined();
        });
    });

    it('should return 401 on invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrong',
        })
        .expect(401);
    });
  });
});
```

---

## 8. API Design

### 8.1 REST Conventions

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/resources` | List all |
| GET | `/resources/:id` | Get one |
| POST | `/resources` | Create |
| PATCH | `/resources/:id` | Partial update |
| PUT | `/resources/:id` | Full replace |
| DELETE | `/resources/:id` | Delete |

### 8.2 Response Format

```typescript
// Success (single)
{
  "data": { ... }
}

// Success (list)
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}

// Error
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### 8.3 Status Codes

| Code | Usage |
|------|-------|
| 200 | Success (GET, PATCH, PUT) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no auth) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

---

## 9. Git Workflow

### 9.1 Branch Naming

```
feature/add-user-authentication
fix/login-button-not-working
hotfix/critical-security-patch
refactor/improve-error-handling
docs/update-api-documentation
```

### 9.2 Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting (no code change) |
| `refactor` | Code restructure |
| `test` | Add/update tests |
| `chore` | Maintenance |

**Examples:**

```
feat(auth): add wallet authentication
fix(ui): correct mobile navigation overflow
docs(api): update swagger descriptions
refactor(users): extract validation logic
test(orders): add unit tests for order service
chore(deps): update nestjs to v10.3
```

### 9.3 Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-reviewed my code
- [ ] Commented complex logic
- [ ] Updated documentation
- [ ] No new warnings
```

---

## 10. Code Review Checklist

### 10.1 Security

- [ ] No hardcoded secrets
- [ ] Input validated on all endpoints
- [ ] Authorization checks present
- [ ] Sensitive data not logged
- [ ] SQL injection prevented

### 10.2 Code Quality

- [ ] TypeScript types properly defined
- [ ] No `any` types (unless justified)
- [ ] Error handling present
- [ ] Logging appropriate
- [ ] Comments for complex logic

### 10.3 Performance

- [ ] No N+1 queries
- [ ] Proper pagination
- [ ] Indexes considered
- [ ] No memory leaks

### 10.4 Testing

- [ ] Unit tests for business logic
- [ ] Edge cases covered
- [ ] Error scenarios tested

---

## 11. Troubleshooting

### 11.1 Common Issues

| Issue | Solution |
|-------|----------|
| `Module not found` | Run `pnpm install` |
| CORS errors | Check `CORS_ORIGINS` in backend |
| JWT expired | Implement token refresh in frontend |
| Rate limited | Wait for window reset |
| RLS blocking queries | Check Supabase policies |

### 11.2 Debug Commands

```bash
# Check backend logs
cd apps/api && npm run start:dev

# Check TypeScript errors
pnpm typecheck

# Run linting
pnpm lint

# Test database connection
cd apps/api && npm run db:test
```

### 11.3 Useful Queries

```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'users';

-- Check indexes
SELECT * FROM pg_indexes WHERE tablename = 'users';

-- Check table sizes
SELECT pg_size_pretty(pg_total_relation_size('users'));
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | Jan 8, 2026 | Complete rewrite with enterprise standards |
| 1.0.0 | Jan 6, 2026 | Initial guidelines |

---

*Maintained by ExoDuZe Engineering Team. For questions, contact engineering@exoduze.io*
