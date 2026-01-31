<?php

namespace App\Controller;

use App\Entity\Visit;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpKernel\Attribute\AsController;
use Symfony\Component\HttpFoundation\Response;

#[AsController]
class CloseVisitController extends AbstractController
{
    public function __invoke(Visit $visit, EntityManagerInterface $em): Response
    {
        // On passe simplement le statut à "closed"
        $visit->setClosed(true);
        $em->flush();

        return $this->json($visit, 200, [], ['groups' => 'visit:read']);
    }
}