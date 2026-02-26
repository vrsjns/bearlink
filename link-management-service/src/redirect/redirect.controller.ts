import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { RedirectService } from './redirect.service';

@Controller()
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  @Get(':alias')
  async redirect(@Param('alias') alias: string, @Res() res: Response) {
    const { redirectUrl } = await this.redirectService.resolve(alias);
    return res.redirect(302, redirectUrl);
  }

  @Post(':alias/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(
    @Param('alias') alias: string,
    @Body('password') password: string,
  ) {
    return this.redirectService.unlock(alias, password);
  }
}
