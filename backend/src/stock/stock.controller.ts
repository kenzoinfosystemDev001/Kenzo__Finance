import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Delete,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { clientIp } from '../common/utils/client-ip';
import { StockService } from './stock.service';
import {
  CreateStockLocationDto,
  CreateStockMovementDto,
  QueryStockBalancesDto,
  QueryStockMovementsDto,
} from './dto/stock.dto';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PERMISSIONS } from '../common/authz/permissions';
import type { AuthenticatedUser } from '../common/authz/authenticated-user';

@ApiTags('Stock')
@ApiBearerAuth()
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get('status')
  @RequirePermissions()
  @ApiOperation({
    summary: 'Whether stock tracking is switched on',
    description:
      'Readable by any signed-in user so the UI can decide what to render ' +
      'before calling a stock endpoint that would otherwise return 409.',
  })
  async status() {
    return { stockTrackingEnabled: await this.stockService.isTrackingEnabled() };
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'Inventory headline figures' })
  async summary() {
    return this.stockService.getSummary();
  }

  @Get('balances')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({
    summary: 'Stock report: on-hand per product, with low/out-of-stock filters',
  })
  async balances(@Query() query: QueryStockBalancesDto) {
    return this.stockService.listBalances(query);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'The stock ledger, filterable by product and date' })
  async movements(@Query() query: QueryStockMovementsDto) {
    return this.stockService.listMovements(query);
  }

  @Get('locations')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'List stock locations' })
  async locations() {
    return this.stockService.listLocations();
  }

  @Delete('locations/:id')
  @RequirePermissions(PERMISSIONS.STOCK_MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Permanently delete a stock location that has never held a movement' })
  async deleteLocation(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.deleteLocation(id, user);
  }

  @Post('locations')
  @RequirePermissions(PERMISSIONS.STOCK_MANAGE_LOCATIONS)
  @ApiOperation({ summary: 'Create a stock location' })
  async createLocation(
    @Body() dto: CreateStockLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.createLocation(dto, user);
  }

  @Get('products/:productId')
  @RequirePermissions(PERMISSIONS.STOCK_READ)
  @ApiOperation({ summary: 'On-hand and recent ledger entries for one product' })
  async productStock(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
  ) {
    await this.stockService.assertTrackingEnabled();

    const [onHand, byLocation, recent] = await Promise.all([
      this.stockService.getProductBalance(productId),
      this.stockService.getProductBalanceByLocation(productId),
      this.stockService.listMovements({
        productId,
        page: 1,
        pageSize: 20,
        sortBy: 'occurredAt',
        sortDir: 'desc',
        skip: 0,
        take: 20,
      } as QueryStockMovementsDto),
    ]);

    return { productId, onHand, byLocation, recentMovements: recent.items };
  }

  @Post('products/:productId/movements')
  @RequirePermissions(PERMISSIONS.STOCK_POST)
  @ApiOperation({
    summary: 'Post a stock movement',
    description:
      'Append-only. Quantity is always positive; the movement type decides ' +
      'the direction. Adjustments require a reason. Stock cannot go negative ' +
      'unless that is explicitly allowed in settings.',
  })
  async postMovement(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.stockService.postMovement(productId, dto, user, {
      ipAddress: clientIp(request),
      userAgent: request.headers['user-agent'] ?? null,
    });
  }
}
