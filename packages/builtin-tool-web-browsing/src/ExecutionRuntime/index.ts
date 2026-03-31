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

const getMemorySnapshot = () => {
  if (typeof process === 'undefined' || typeof process.memoryUsage !== 'function') {
    return 'non-node';
  }

  const { heapUsed, rss } = process.memoryUsage();

  return `rss=${rss} heap=${heapUsed}`;
};

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
      try {
        log('search:prepare-results results=%d mem=%s', data.results.length, getMemorySnapshot());
      } catch {}

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
      try {
        log('search:before-xml items=%d mem=%s', searchContent.length, getMemorySnapshot());
      } catch {}
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

    try {
      log('crawl:prepare-results results=%d mem=%s', results.length, getMemorySnapshot());
    } catch {}

    const content = results.map((item) =>
      'errorMessage' in item
        ? item
        : {
            ...item.data,
            // if crawl too many content
            // slice the top 10000 char
            content: item.data.content?.slice(0, CRAWL_CONTENT_LIMITED_COUNT),
          },
    );

    try {
      log('crawl:before-xml items=%d mem=%s', content.length, getMemorySnapshot());
    } catch {}
    const xmlContent = crawlResultsPrompt(content as any);

    return {
      content: xmlContent,
      state: response,
      success: true,
    };
  }
}
