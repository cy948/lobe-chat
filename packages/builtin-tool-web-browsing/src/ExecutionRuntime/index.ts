import { crawlResultsPrompt, searchResultsPrompt } from '@lobechat/prompts';
import type {
  BuiltinServerRuntimeOutput,
  CrawlMultiPagesQuery,
  CrawlSinglePageQuery,
  SearchContent,
  SearchQuery,
  SearchServiceImpl,
} from '@lobechat/types';
import debug from 'debug';

import { CRAWL_CONTENT_LIMITED_COUNT, SEARCH_ITEM_LIMITED_COUNT } from '../const';

const log = debug('lobe-oom:web-browsing');

const formatMB = (value: number) => `${Math.round(value / 1024 / 1024)}MB`;

const getMemorySnapshot = () => {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return 'non-node';
  }

  const memory = process.memoryUsage();

  return `rss=${formatMB(memory.rss)} heap=${formatMB(memory.heapUsed)}`;
};

const getUrlHosts = (urls: string[]) =>
  urls.map((url) => {
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-url';
    }
  });

export class WebBrowsingExecutionRuntime {
  private searchService: SearchServiceImpl;

  constructor(options: { searchService: SearchServiceImpl }) {
    this.searchService = options.searchService;
  }

  async search(
    args: SearchQuery,
    options?: { signal?: AbortSignal },
  ): Promise<BuiltinServerRuntimeOutput> {
    try {
      const data = await this.searchService.webSearch(args as SearchQuery, options);

      // If search failed with error detail, return as failure
      if (data.errorDetail) {
        return {
          content: data.errorDetail,
          error: { message: data.errorDetail },
          state: data,
          success: false,
        };
      }

      const estimatedContentChars = data.results.reduce(
        (total, item) => total + (item.content?.length || 0),
        0,
      );
      const maxContentLength = data.results.reduce(
        (max, item) => Math.max(max, item.content?.length || 0),
        0,
      );

      log(
        'search:prepare-results results=%d chars=%d max=%d mem=%s',
        data.results.length,
        estimatedContentChars,
        maxContentLength,
        getMemorySnapshot(),
      );

      // add LIMITED_COUNT search results to message content
      const searchContent: SearchContent[] = data.results
        .slice(0, SEARCH_ITEM_LIMITED_COUNT)
        .map((item) => ({
          title: item.title,
          url: item.url,
          ...(item.content && { content: item.content }),
          ...(item.publishedDate && { publishedDate: item.publishedDate }),
          ...(item.imgSrc && { imgSrc: item.imgSrc }),
          ...(item.thumbnail && { thumbnail: item.thumbnail }),
        }));

      // Convert to XML format to save tokens
      log('search:before-xml items=%d mem=%s', searchContent.length, getMemorySnapshot());
      const xmlContent = searchResultsPrompt(searchContent);

      return { content: xmlContent, state: data, success: true };
    } catch (e) {
      return { content: (e as Error).message, error: e, success: false };
    }
  }

  async crawlSinglePage(args: CrawlSinglePageQuery): Promise<BuiltinServerRuntimeOutput> {
    return this.crawlMultiPages({ urls: [args.url] });
  }

  async crawlMultiPages(args: CrawlMultiPagesQuery): Promise<BuiltinServerRuntimeOutput> {
    const response = await this.searchService.crawlPages({
      urls: args.urls,
    });

    const { results } = response;

    const estimatedContentChars = results.reduce((total, item) => {
      if ('errorMessage' in item.data) return total;

      return total + (item.data.content?.length || 0);
    }, 0);
    const maxContentLength = results.reduce((max, item) => {
      if ('errorMessage' in item.data) return max;

      return Math.max(max, item.data.content?.length || 0);
    }, 0);
    log(
      'crawl:prepare-results results=%d chars=%d max=%d mem=%s',
      results.length,
      estimatedContentChars,
      maxContentLength,
      getMemorySnapshot(),
    );

    const content = results.map((item) =>
      'errorMessage' in item.data
        ? item
        : {
            ...item.data,
            // if crawl too many content
            // slice the top 10000 char
            content: item.data.content?.slice(0, CRAWL_CONTENT_LIMITED_COUNT),
          },
    );

    log('crawl:before-xml items=%d mem=%s', content.length, getMemorySnapshot());
    const xmlContent = crawlResultsPrompt(content as any);

    return {
      content: xmlContent,
      state: response,
      success: true,
    };
  }
}
