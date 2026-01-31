<?php

namespace App\Command;

use App\Repository\VisitRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:visits:archive',
    description: 'Clôture automatiquement les visites ouvertes depuis plus de 72h.',
)]
class ArchiveExpiredVisitsCommand extends Command
{
    public function __construct(
        private VisitRepository $visitRepository,
        private EntityManagerInterface $entityManager
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        
        // 1. Récupérer les visites expirées
        $expiredVisits = $this->visitRepository->findExpiredVisits();
        $count = count($expiredVisits);

        if ($count === 0) {
            $io->info('Aucune visite expirée à archiver.');
            return Command::SUCCESS;
        }

        $io->section("Traitement de $count visites expirées...");

        // 2. Boucler et fermer
        foreach ($expiredVisits as $visit) {
            $visit->setActivated(false);
            $io->text("⏳ Clôture visite ID: {$visit->getId()} - Client: {$visit->getCustomer()->getName()}");
        }

        // 3. Sauvegarder en base (Une seule fois pour la performance)
        $this->entityManager->flush();

        $io->success("$count visites ont été archivées automatiquement.");

        return Command::SUCCESS;
    }
}