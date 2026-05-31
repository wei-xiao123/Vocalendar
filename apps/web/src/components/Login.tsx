import { ArrowRight, Github, Lock } from 'lucide-react'
import { motion } from 'motion/react'

import bgImage from '../assets/images/calendar-bg.png'

type LoginProps = {
  errorMessage: string | null
  isCreatingGuest: boolean
  isStartingGitHubLogin: boolean
  onGitHubLogin: () => void
  onGuestSession: () => void
}

export function Login({
  errorMessage,
  isCreatingGuest,
  isStartingGitHubLogin,
  onGitHubLogin,
  onGuestSession,
}: LoginProps) {
  return (
    <div className="relative flex h-screen max-h-screen w-full overflow-hidden bg-[#F7F3EB] font-sans">
      <div className="pointer-events-none absolute inset-0 z-0 h-full w-full">
        <img
          alt="Desk background"
          className="h-full w-full object-cover object-center opacity-90"
          src={bgImage}
        />
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-transparent via-[#F7F2EB]/50 to-[#FAF7F2] lg:block" />
        <div className="pointer-events-none absolute inset-0 bg-[#F7F3EB]/20 lg:hidden" />
      </div>

      <div className="pointer-events-none absolute left-[15%] top-[25%] z-10 hidden lg:block">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 w-max rounded-full border border-white/80 bg-[#FAF9F6] px-6 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-sm font-medium tracking-wide text-[#55504A]">
            下周三上午开会
          </span>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 ml-16 w-max rounded-full border border-[#D5EFE3]/50 bg-[#E4F1EB] px-6 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.6 }}
        >
          <span className="text-sm font-medium tracking-wide text-[#3F4F46]">
            好的，已为你添加日程
          </span>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mb-[40px] ml-36 flex w-max items-center justify-center gap-1.5 rounded-[100px] border border-neutral-100/80 bg-white px-5 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          transition={{ delay: 0.9 }}
        >
          {[1, 2, 3, 5, 4, 3, 2, 1].map((height, index) => (
            <div
              className="w-[3px] rounded-full bg-[#87C0A0]"
              key={index}
              style={{ height: `${height * 4}px` }}
            />
          ))}
        </motion.div>
      </div>

      <div className="relative z-10 ml-auto flex h-full w-full flex-col items-center justify-center px-8 py-12 text-center lg:w-[45%] lg:items-start lg:px-16 lg:text-left">
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="mx-auto w-full max-w-md lg:mx-0 lg:pl-10"
          initial={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-10 select-none pr-4 font-serif text-[52px] font-semibold leading-none tracking-tighter text-[#736555]">
            Vocalendar
          </div>

          <h1 className="sr-only">日程工作台</h1>
          <div className="mb-5 whitespace-nowrap text-4xl font-semibold tracking-[0.03em] text-[#3D362D] md:text-[46px]">
            用声音，打理你的时间
          </div>
          <p className="mb-14 text-[17px] font-normal tracking-wide text-[#7B7368] lg:pl-1">
            语音日历助手，让每一天都井井有条
          </p>

          <div className="mb-16 flex h-8 w-full items-center justify-center gap-1.5 lg:justify-start">
            {[1, 1.5, 1.5, 2, 1.5, 2, 3, 4, 5, 7, 8, 10, 11, 11, 9, 7, 6, 4, 3, 2.5, 2, 1.5, 1].map(
              (height, index) => (
                <div
                  className={`w-1 rounded-full ${index < 8 ? 'bg-[#E5D7B7]' : 'bg-[#AAD2C5]'}`}
                  key={index}
                  style={{ height: `${height * 3}px`, opacity: 0.85 }}
                />
              ),
            )}
          </div>

          <div className="mx-auto flex w-full max-w-[320px] flex-col gap-6 lg:mx-0">
            <button
              aria-label={isStartingGitHubLogin ? '跳转中...' : 'GitHub 登录'}
              className="group relative flex w-full items-center justify-center gap-2 rounded-full bg-[#87C0A0] py-4 font-medium tracking-wide text-white shadow-[0_8px_20px_rgba(135,192,160,0.35)] transition-all duration-300 hover:bg-[#76AE8E] disabled:cursor-wait disabled:opacity-70"
              disabled={isStartingGitHubLogin}
              onClick={onGitHubLogin}
              type="button"
            >
              <Github className="mb-[1px] h-[20px] w-[20px]" />
              <span className="text-[15px]">
                {isStartingGitHubLogin ? '跳转中...' : '使用 GitHub 账号登录'}
              </span>
            </button>

            <button
              aria-label={isCreatingGuest ? '正在进入...' : '游客模式'}
              className="group mx-auto flex items-center justify-center gap-1.5 text-sm font-medium tracking-widest text-[#9B938A] transition-colors hover:text-[#645C54] disabled:cursor-wait disabled:opacity-70 lg:mx-0 lg:justify-start"
              disabled={isCreatingGuest}
              onClick={onGuestSession}
              type="button"
            >
              <span>{isCreatingGuest ? '正在进入...' : '暂不登录，先去逛逛'}</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {errorMessage ? (
            <p
              className="mt-8 rounded-2xl border border-red-200 bg-white/75 px-4 py-3 text-sm font-medium text-red-700"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
        </motion.div>
      </div>

      <div className="absolute bottom-8 left-10 z-10 flex items-center gap-2 opacity-70">
        <Lock className="h-3.5 w-3.5 text-[#554E48]" />
        <div className="font-mono text-[11px] font-medium tracking-[0.15em] text-[#554E48]">
          ENCRYPTED CONNECTION
        </div>
      </div>
      <div className="absolute bottom-8 right-10 z-10 hidden opacity-70 sm:block">
        <div className="font-mono text-[11px] font-medium tracking-[0.15em] text-[#554E48]">
          V1.0.4 - BETA
        </div>
      </div>
    </div>
  )
}
