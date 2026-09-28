import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, type User } from '../generated/prisma/client';
import { CreateReviewDto, ReviewFilterDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Send the "Rate your pickup" survey for your own collected claim. */
  @Roles(UserRole.TAKER)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    return this.reviews.create(dto, user);
  }

  /** Manager: tallies (average rating, per-star, pickup ease, what they'll grow). */
  @Roles(UserRole.MANAGER)
  @Get('summary')
  summary(@CurrentUser() user: User, @Query() q: ReviewFilterDto) {
    return this.reviews.summary(q, user);
  }

  /** The review page for one claim: header facts, `canReview`, and any existing review. */
  @Get('claim/:claimId')
  forClaim(
    @CurrentUser() user: User,
    @Param('claimId', ParseUUIDPipe) claimId: string,
  ) {
    return this.reviews.forClaim(claimId, user);
  }

  /** Manager: all reviews (filter by batch, taker, rating, withNote, dates). Taker: own. */
  @Get()
  list(@CurrentUser() user: User, @Query() q: ReviewFilterDto) {
    return this.reviews.list(q, user);
  }
}
