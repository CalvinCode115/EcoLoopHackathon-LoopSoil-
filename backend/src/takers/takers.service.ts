import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DomainException } from '../common/errors/domain.exception';
import { pageArgs, paginated, type Paginated } from '../common/pagination';
import {
  Prisma,
  TakerStatus,
  TakerType,
  type Taker,
  type User,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBulkTakerDto } from './dto/create-bulk-taker.dto';
import type { ListTakersQueryDto } from './dto/list-takers-query.dto';
import type { RegisterTakerDto } from './dto/register-taker.dto';
import type { UpdateTakerDto } from './dto/update-taker.dto';

@Injectable()
export class TakersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── bulk records (manager) ──────────────────────────────────────────────

  /** Bulk orgs are vetted by the act of the manager creating them → APPROVED immediately. */
  createBulk(dto: CreateBulkTakerDto, manager: User): Promise<Taker> {
    return this.prisma.taker.create({
      data: {
        name: dto.name,
        category: dto.category,
        email: dto.email,
        phone: dto.phone,
        intendedUse: dto.intendedUse,
        monthlyKgTarget: dto.monthlyKgTarget,
        type: TakerType.BULK,
        status: TakerStatus.APPROVED,
        createdById: manager.id,
      },
    });
  }

  /** `status=PENDING&type=INDIVIDUAL` is the manager's vetting queue. */
  async list(q: ListTakersQueryDto): Promise<Paginated<Taker>> {
    const where: Prisma.TakerWhereInput = {
      type: q.type,
      status: q.status,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, data] = await Promise.all([
      this.prisma.taker.count({ where }),
      this.prisma.taker.findMany({
        where,
        orderBy: { name: 'asc' },
        ...pageArgs(q),
      }),
    ]);
    return paginated(data, total, q);
  }

  async getById(id: string): Promise<Taker> {
    const taker = await this.prisma.taker.findUnique({ where: { id } });
    if (!taker) throw new NotFoundException('Taker not found');
    return taker;
  }

  /** Manager edit — including `status` (APPROVED / SUSPENDED) for vetting. */
  async update(id: string, dto: UpdateTakerDto): Promise<Taker> {
    await this.getById(id);
    return this.prisma.taker.update({ where: { id }, data: dto });
  }

  // ─── individuals (self-service) ──────────────────────────────────────────

  findByUserId(userId: string): Promise<Taker | null> {
    return this.prisma.taker.findUnique({ where: { userId } });
  }

  /** One Taker per login. Lands PENDING until a manager approves (§20 default). */
  async register(dto: RegisterTakerDto, user: User): Promise<Taker> {
    const existing = await this.findByUserId(user.id);
    if (existing) {
      throw new DomainException(
        'TAKER_EXISTS',
        'You are already registered',
        HttpStatus.CONFLICT,
      );
    }
    const name = dto.name ?? user.name;
    const phone = dto.phone ?? user.phone;
    return this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.phone) {
        await tx.user.update({ where: { id: user.id }, data: { name, phone } });
      }
      return tx.taker.create({
        data: {
          name,
          email: user.email,
          phone,
          intendedUse: dto.intendedUse,
          type: TakerType.INDIVIDUAL,
          status: TakerStatus.PENDING,
          userId: user.id,
        },
      });
    });
  }

  async getMine(user: User): Promise<Taker> {
    const taker = await this.findByUserId(user.id);
    if (!taker) {
      throw new NotFoundException('You have not registered as a taker yet');
    }
    return taker;
  }

  /** Profile edits — name/phone are mirrored onto the User so contact details stay in sync. */
  async updateMine(dto: RegisterTakerDto, user: User): Promise<Taker> {
    const taker = await this.getMine(user);
    return this.prisma.$transaction(async (tx) => {
      if (dto.name || dto.phone) {
        await tx.user.update({
          where: { id: user.id },
          data: { name: dto.name, phone: dto.phone },
        });
      }
      return tx.taker.update({
        where: { id: taker.id },
        data: {
          name: dto.name,
          phone: dto.phone,
          intendedUse: dto.intendedUse,
        },
      });
    });
  }

  /** The gate in front of every self-serve claim action. */
  async requireApprovedIndividual(user: User): Promise<Taker> {
    const taker = await this.findByUserId(user.id);
    if (!taker) {
      throw new DomainException(
        'TAKER_NOT_REGISTERED',
        'Complete your taker registration before claiming compost',
        HttpStatus.FORBIDDEN,
      );
    }
    if (taker.status === TakerStatus.PENDING) {
      throw new DomainException(
        'TAKER_NOT_APPROVED',
        'Your registration is awaiting manager approval',
        HttpStatus.FORBIDDEN,
      );
    }
    if (taker.status === TakerStatus.SUSPENDED) {
      throw new DomainException(
        'TAKER_SUSPENDED',
        'Your taker account has been suspended — contact the SUSS compost team',
        HttpStatus.FORBIDDEN,
      );
    }
    return taker;
  }
}
