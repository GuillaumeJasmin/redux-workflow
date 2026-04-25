import { select, Separator } from '@inquirer/prompts';
import { execSync } from 'child_process';

async function main() {
  const answer = await select({
    message: 'Select a package manager',
    choices: [
      {
        name: 'build',
        value: () => {
          execSync('pnpm build', { stdio: 'inherit' });
        },
        description: 'Build the project',
      },
      {
        name: 'test',
        value: () => {
          execSync('pnpm test', { stdio: 'inherit' });
        },
        description: 'Run the tests',
      },
      {
        name: 'typecheck',
        value: () => {
          execSync('pnpm typecheck', { stdio: 'inherit' });
        },
        description: 'Run the type checks',
      },
      {
        name: 'lint',
        value: () => {
          execSync('pnpm lint', { stdio: 'inherit' });
        },
        description: 'Run the lint checks',
      },
      {
        name: 'launch-website',
        value: () => {
          execSync('pnpm --filter @redux-workflow/website start', { stdio: 'inherit' });
        },
        description: 'Launch the website',
      },
    ] as const,
  });

  answer();

  //   answer?.value();
}

main();
