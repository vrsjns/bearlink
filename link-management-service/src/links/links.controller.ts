import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { UpdateLinkDto } from './dto/update-link.dto';

@UseGuards(JwtAuthGuard)
@Controller('links')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLinkDto, @CurrentUser() user: any) {
    return this.linksService.create(dto, user.id);
  }

  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  bulkCreate(@Body() dtos: CreateLinkDto[], @CurrentUser() user: any) {
    return this.linksService.bulkCreate(dtos, user.id);
  }

  @Get('export')
  async exportLinks(@CurrentUser() user: any, @Res() res: Response) {
    const links = await this.linksService.export(user.id);
    res.setHeader('Content-Disposition', 'attachment; filename="links.json"');
    res.json(links);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.linksService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.linksService.findOne(id, user.id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLinkDto,
    @CurrentUser() user: any,
  ) {
    return this.linksService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.linksService.remove(id, user.id);
  }
}
