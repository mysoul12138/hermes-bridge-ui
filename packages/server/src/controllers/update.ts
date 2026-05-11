export async function handleUpdate(ctx: any) {
  ctx.status = 409
  ctx.body = {
    success: false,
    message: 'Automatic npm update is disabled on this fork. Use the independent fork workflow: fix in HermesWebUi_fork_main_latest/custom-code-isolation, sync to hermes-bridge-ui/main, build, then replace WSL dist.',
  }
}
